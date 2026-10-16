import React from "react";
import { createRoot } from "react-dom/client";

// Drops outside a handled zone must be swallowed here.
//
// A file dropped anywhere Chromium does not have a handler for is treated as a
// navigation: the window replaces the app with the file. In a browser that is
// merely surprising; in an Electron shell it blanks the UI with no way back
// except reopening the window, and it takes the whole renderer's state with it.
//
// These run in the bubble phase, so a component's own onDrop (React listens on
// the root container, inside document) has already had its turn — the chat's
// drop handler still works, and everything it did not claim lands here and is
// discarded instead of navigating.
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (e) => e.preventDefault());
}

const root = createRoot(document.getElementById("root")!);
if (new URLSearchParams(window.location.search).has("visual-preview")) {
  void Promise.all([
    import("./openui-visual"),
    import("@unbiased/iui/styles.css"),
    import("@unbiased/iui/openui-styles.css"),
    import("./openui-visual.css"),
  ]).then(([{ visualFenceContent }]) => {
    document.documentElement.style.cssText = "--panel:#1f1f1f;--panel-2:#292929;--fg-msg:#f5f5f5;--dim:#a5a5a5;--border:#383838;--accent:#ff5546;";
    document.body.style.cssText = "margin:0;padding:16px;background:#141414;color:#f5f5f5;font:16px/1.5 system-ui,sans-serif;";
    const previewWindow = window as typeof window & {
      __renderVisualPreview?: (source: string, scriptedVisualUrls?: Record<string, string>) => Promise<void>;
      __visualPreviewIssues?: string[];
    };
    previewWindow.__renderVisualPreview = async (source, scriptedVisualUrls = {}) => {
      previewWindow.__visualPreviewIssues = [];
      // This isolated renderer gets only the URL registration used by VisualHtml.
      // It never receives the app preload or any host-action bridge.
      (previewWindow as unknown as { unbiased: { registerVisual: (html: string) => Promise<string | null> } }).unbiased = {
        registerVisual: async (html) => scriptedVisualUrls[html] ?? null,
      };
      window.addEventListener("message", (event) => {
        if (event.origin !== "null" || event.source !== document.querySelector<HTMLIFrameElement>(".app-openui-visual iframe")?.contentWindow ||
            event.data?.type !== "unbiased-visual-diagnostics") return;
        previewWindow.__visualPreviewIssues = Array.isArray(event.data.issues) ? event.data.issues : [];
      }, { once: false });
      root.render(visualFenceContent("openui", source, false));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (Object.keys(scriptedVisualUrls).length) {
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          if (document.querySelector(".app-openui-visual [role=alert]")) throw new Error("Scripted visual could not load");
          const frame = document.querySelector<HTMLIFrameElement>(".app-openui-visual iframe");
          if (frame && frame.style.visibility === "visible") return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("Scripted visual did not become ready");
      }
    };
  });
} else {
  void import("./App").then(({ App }) => root.render(<React.StrictMode><App /></React.StrictMode>));
}
