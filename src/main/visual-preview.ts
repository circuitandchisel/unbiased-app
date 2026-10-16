import { BrowserWindow } from "electron";
import { blockingPreviewConsoleErrors, isStaleOptimizedDependency } from "./visual-preview-diagnostics";
import { inspectVisualPreviewGeometry } from "./visual-preview-geometry";
import { advanceFocusedSequence, discoverOpenUIControls, probeOpenUIControl, type OpenUIControlState } from "./visual-preview-probe";
import { probeScriptedVisual, type ScriptedProbeResult } from "./visual-scripted-probe";

export type VisualPreview = {
  imageUrl: string;
  interactionImageUrl?: string;
  stateImageUrls?: { label: string; imageUrl: string }[];
  issues: string[];
  width: number;
  height: number;
  interactionsTested: number;
  interactionStates?: { label: string; outcome: string }[];
  navigationOnly?: boolean;
};

const PREVIEW_WIDTHS = [760, 390] as const;

async function bounded<T>(operation: Promise<T>, label: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Run in an isolated renderer, never the conversation's webContents.
export async function previewVisual(
  source: string,
  options: { rendererUrl?: string; rendererFile: string; scriptedVisualUrls?: Record<string, string> },
): Promise<VisualPreview[]> {
  const previews: VisualPreview[] = [];
  for (const width of PREVIEW_WIDTHS) {
    // The chat's saved per-origin zoom must not shrink mobile previews.
    const window = new BrowserWindow({
      show: false,
      width,
      height: 850,
      webPreferences: {
        partition: "visual-preview",
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      },
    });
    const errors: string[] = [];
    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 3 && errors.length < 16) errors.push(message);
    });
    try {
      for (let attempt = 0; attempt < (options.rendererUrl ? 2 : 1); attempt++) {
        try {
          if (options.rendererUrl) {
            const url = new URL(options.rendererUrl);
            url.searchParams.set("visual-preview", "1");
            if (attempt) url.searchParams.set("visual-preview-retry", String(attempt));
            await bounded(window.loadURL(url.toString()), "Preview page load", 8000);
          } else {
            await bounded(window.loadFile(options.rendererFile, { query: { "visual-preview": "1" } }), "Preview page load", 8000);
          }
          window.webContents.setZoomFactor(1);
          await bounded(window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const deadline = Date.now() + 5000;
          const poll = () => {
            if (typeof window.__renderVisualPreview === 'function') return window.__renderVisualPreview(${JSON.stringify(source)}, ${JSON.stringify(options.scriptedVisualUrls ?? {})}).then(resolve, reject);
            if (Date.now() > deadline) return reject(new Error('Preview renderer did not start'));
            setTimeout(poll, 25);
          };
          poll();
        })`), "Visual render", 15000);
          await new Promise((resolve) => setTimeout(resolve, 180));
          if (attempt === 0 && options.rendererUrl && isStaleOptimizedDependency(errors)) {
            errors.length = 0;
            continue;
          }
          break;
        } catch (error) {
          if (attempt === 0 && options.rendererUrl && isStaleOptimizedDependency([...errors, String(error)])) {
            errors.length = 0;
            continue;
          }
          throw error;
        }
      }
      const surfaceError = await bounded(window.webContents.executeJavaScript('document.querySelector(".app-openui-status")?.textContent || (!document.querySelector(".app-openui-visual") ? "OpenUI did not render a visual surface." : "")'), "Visual surface inspection", 3000) as string;
      if (surfaceError) throw new Error(surfaceError.trim());
      const geometry = await bounded(window.webContents.executeJavaScript(`(${inspectVisualPreviewGeometry.toString()})()`), "Layout inspection", 3000) as { height: number; issues: string[] };
      window.setContentSize(width, geometry.height);
      const image = await bounded(window.webContents.capturePage(), "Screenshot capture", 5000);
      if (image.isEmpty()) throw new Error("Preview screenshot was empty");
      let interactionImageUrl: string | undefined;
      let interactionsTested = 0;
      let interactionIssues: string[] = [];
      let interactionStates: { label: string; outcome: string }[] | undefined;
      const stateImageUrls: { label: string; imageUrl: string }[] = [];
      let navigationOnly = false;
      const sequenceCount = await bounded(window.webContents.executeJavaScript('Number(document.querySelector("[data-openui-focused-sequence]")?.getAttribute("data-openui-slide-count") || 0)'), "Sequence discovery", 3000) as number;
      if (options.scriptedVisualUrls && Object.keys(options.scriptedVisualUrls).length) {
        const state = await bounded(window.webContents.executeJavaScript(`(${probeScriptedVisual.toString()})()`), "Scripted visual interaction inspection", 6000) as ScriptedProbeResult;
        interactionsTested = state.tested;
        interactionIssues = state.issues;
        interactionStates = state.states;
        navigationOnly = state.navigationOnly;
        const stateGeometry = await bounded(window.webContents.executeJavaScript(`(${inspectVisualPreviewGeometry.toString()})()`), "Scripted visual layout inspection", 3000) as { height: number; issues: string[] };
        interactionIssues.push(...stateGeometry.issues);
        window.setContentSize(width, stateGeometry.height);
        const interacted = await bounded(window.webContents.capturePage(), "Scripted visual screenshot", 5000);
        if (interacted.isEmpty()) throw new Error("Scripted visual screenshot was empty");
        interactionImageUrl = `data:image/png;base64,${interacted.toPNG().toString("base64")}`;
      } else if (sequenceCount) {
        interactionStates = [];
        if (sequenceCount < 2 || sequenceCount > 12) interactionIssues.push("FocusedSequence must have 2-12 stages.");
        for (let index = 1; index < Math.min(sequenceCount, 12); index++) {
          const state = await bounded(window.webContents.executeJavaScript(`(${advanceFocusedSequence.toString()})()`), "Sequence stage inspection", 5000) as Awaited<ReturnType<typeof advanceFocusedSequence>>;
          interactionsTested++;
          interactionStates.push({ label: `Stage ${state.stage}/${state.total}`, outcome: state.outcome });
          if (!state.sceneChanged) interactionIssues.push(`Stage ${state.stage}: illustration did not change.`);
          if (!state.textChanged) interactionIssues.push(`Stage ${state.stage}: explanation did not change.`);
          const stateGeometry = await bounded(window.webContents.executeJavaScript(`(${inspectVisualPreviewGeometry.toString()})()`), "State layout inspection", 3000) as { height: number; issues: string[] };
          interactionIssues.push(...stateGeometry.issues.map((issue) => `Stage ${state.stage}: ${issue}`));
          window.setContentSize(width, stateGeometry.height);
          if (width === PREVIEW_WIDTHS[0]) {
            const stateImage = await bounded(window.webContents.capturePage(), "State screenshot capture", 5000);
            if (stateImage.isEmpty()) throw new Error("State screenshot was empty");
            stateImageUrls.push({ label: `Stage ${state.stage}`, imageUrl: `data:image/png;base64,${stateImage.resize({ width: 560 }).toPNG().toString("base64")}` });
          }
        }
        const interacted = await bounded(window.webContents.capturePage(), "Interaction screenshot", 5000);
        if (interacted.isEmpty()) throw new Error("Interaction screenshot was empty");
        interactionImageUrl = `data:image/png;base64,${interacted.toPNG().toString("base64")}`;
      } else {
        const probeHostButtons = !/@(?:OpenUrl|ToAssistant|Run)\s*\(/.test(source) &&
          (!/\b(?:Button|IconButton)\s*\(/.test(source) || /@(?:Set|Reset)\s*\(/.test(source));
        const selector = probeHostButtons
          ? ".app-openui-visual button:not(:disabled), .app-openui-visual input[type=range]:not(:disabled)"
          : ".app-openui-visual input[type=range]:not(:disabled)";
        const count = await bounded(window.webContents.executeJavaScript(`(${discoverOpenUIControls.toString()})(${JSON.stringify(selector)})`), "OpenUI control discovery", 3000) as number;
        interactionStates = [];
        let changedButtons = 0;
        let buttons = 0;
        let changedRanges = 0;
        let ranges = 0;
        for (let index = 0; index < count; index++) {
          const state = await bounded(window.webContents.executeJavaScript(`(${probeOpenUIControl.toString()})(${index})`), "OpenUI interaction inspection", 5000) as OpenUIControlState;
          interactionsTested++;
          interactionStates.push({ label: state.label, outcome: state.outcome });
          if (state.kind === "button") {
            buttons++;
            if (state.changed) changedButtons++;
          } else {
            ranges++;
            if (state.changed) changedRanges++;
          }
          const stateGeometry = await bounded(window.webContents.executeJavaScript(`(${inspectVisualPreviewGeometry.toString()})()`), "State layout inspection", 3000) as { height: number; issues: string[] };
          interactionIssues.push(...stateGeometry.issues.map((issue) => `${state.label}: ${issue}`));
          window.setContentSize(width, stateGeometry.height);
          if (width === PREVIEW_WIDTHS[0] && index < 6 && state.changed) {
            const stateImage = await bounded(window.webContents.capturePage(), "State screenshot capture", 5000);
            if (stateImage.isEmpty()) throw new Error("State screenshot was empty");
            stateImageUrls.push({ label: state.label, imageUrl: `data:image/png;base64,${stateImage.resize({ width: 560 }).toPNG().toString("base64")}` });
          }
        }
        if (buttons && !changedButtons) interactionIssues.push("OpenUI buttons did not change visual content.");
        if (ranges && !changedRanges) interactionIssues.push("OpenUI range did not change visual content.");
        if (interactionsTested > 0 && (stateImageUrls.length === 0 || interactionsTested > 6)) {
          const interacted = await bounded(window.webContents.capturePage(), "Interaction screenshot", 5000);
          if (interacted.isEmpty()) throw new Error("Interaction screenshot was empty");
          interactionImageUrl = `data:image/png;base64,${interacted.toPNG().toString("base64")}`;
        }
      }
      const consoleIssues = blockingPreviewConsoleErrors(errors, Boolean(options.rendererUrl));
      previews.push({ imageUrl: `data:image/png;base64,${image.toPNG().toString("base64")}`, interactionImageUrl, stateImageUrls, interactionsTested, interactionStates, navigationOnly, issues: [...new Set([...geometry.issues, ...interactionIssues, ...consoleIssues.slice(0, 4).map((message) => message.slice(0, 240))])].slice(0, 16), width, height: geometry.height });
    } finally {
      if (!window.isDestroyed()) window.destroy();
    }
  }
  return previews;
}
