import { z } from "zod/v4";

export const INTERACTIVE_VISUAL_SCHEME = "unbiased-visual";
export const MAX_INTERACTIVE_VISUAL_LENGTH = 128_000;

export const visualHtmlSchema = z.object({
  source: z.string().min(1).max(MAX_INTERACTIVE_VISUAL_LENGTH).refine(isInteractiveVisualSource),
}).strict();

export function interactiveVisualId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const id = url.pathname.slice(1);
    return url.protocol === `${INTERACTIVE_VISUAL_SCHEME}:` && url.hostname === "view" &&
      /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname) &&
      !url.search && !url.hash ? id : null;
  } catch {
    return null;
  }
}

export const INTERACTIVE_VISUAL_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export function isInteractiveVisualSource(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_INTERACTIVE_VISUAL_LENGTH &&
    /<[a-z][\s\S]*>/i.test(value) &&
    !/<\/?(?:html|head|body)\b|<!doctype\b/i.test(value);
}

export function interactiveVisualDocument(source: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: dark; --visual-bg: #1f1f1f; --visual-fg: #f5f5f5; --visual-muted: #999; --visual-accent: #ff5546; }
  * { box-sizing: border-box; }
  body { margin: 0; min-width: 0; overflow-x: hidden; background: var(--visual-bg); color: var(--visual-fg); font: 14px/1.5 system-ui, sans-serif; }
</style>
<script>
  (() => {
  const reportFailure = (kind, detail) => {
    parent.postMessage({ type: 'unbiased-visual-error', kind, detail: String(detail || '').slice(0, 300) }, '*');
  };
  let viewScale = 1;
  const reportHeight = () => {
    const height = Math.max(document.body.scrollHeight * viewScale, document.body.getBoundingClientRect().height);
    parent.postMessage({ type: 'unbiased-visual-height', height: Math.ceil(height) }, '*');
  };
  const probeInteractions = async (requestId) => {
    const controls = Array.from(document.querySelectorAll('button,input[type="range"],[role="button"]'))
      .filter(el => !el.hidden && !el.disabled && getComputedStyle(el).display !== 'none').slice(0, 8);
    const scene = document.querySelector('[data-visual-scene]');
    const outcome = document.querySelector('[data-visual-outcome]');
    const issues = [];
    const states = [];
    const unchanged = [];
    const sceneSnapshot = () => {
      if (!scene) return '';
      const styleState = Array.from(scene.querySelectorAll('*')).slice(0, 256).map(el => {
        const style = getComputedStyle(el);
        return [style.display, style.visibility, style.opacity, style.fill, style.stroke,
          style.transform, style.clipPath].join(':');
      }).join('|');
      const canvasState = Array.from(scene.querySelectorAll('canvas')).slice(0, 4).map(canvas => {
        try { return canvas.toDataURL(); } catch { return ''; }
      }).join('|');
      return scene.outerHTML + styleState + canvasState;
    };
    let tested = 0;
    if (controls.length && (!scene || !outcome)) {
      issues.push('Interactive visuals need data-visual-scene on the illustration and data-visual-outcome on its explanation.');
    } else if (scene && outcome) {
      for (const control of controls) {
        const group = control.closest('[role="group"]');
        if (control.getAttribute('aria-pressed') === 'true' && group &&
            Array.from(group.querySelectorAll('[aria-pressed="false"]')).length) continue;
        const beforeScene = sceneSnapshot();
        const beforeOutcome = outcome.textContent.trim();
        if (control.matches('input[type="range"]')) {
          const next = control.value === control.max ? control.min : control.max;
          control.value = next;
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          control.click();
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        tested++;
        const label = (control.getAttribute('aria-label') || control.textContent || 'Control').trim().slice(0, 50);
        states.push({ label, outcome: outcome.textContent.trim().replace(/\\s+/g, ' ').slice(0, 180) });
        if (sceneSnapshot() === beforeScene || outcome.textContent.trim() === beforeOutcome)
          unchanged.push({ control, label });
      }
      for (const { control, label } of unchanged) {
        const beforeScene = sceneSnapshot();
        const beforeOutcome = outcome.textContent.trim();
        if (control.matches('input[type="range"]')) {
          const next = control.value === control.max ? control.min : control.max;
          control.value = next;
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          control.click();
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (sceneSnapshot() === beforeScene) issues.push(label + ' did not change the illustration.');
        if (outcome.textContent.trim() === beforeOutcome) issues.push(label + ' did not change the explanation.');
      }
    }
    const navigationOnly = controls.length > 1 && controls.every(control => control.matches('button[data-step]'));
    parent.postMessage({ type: 'unbiased-visual-preview-result', requestId, tested, states,
      navigationOnly, issues: issues.slice(0, 8) }, '*');
  };
  addEventListener('error', event => reportFailure('runtime-error', event.message));
  addEventListener('unhandledrejection', event => reportFailure('unhandled-rejection', event.reason));
  addEventListener('message', event => {
    if (event.source !== parent) return;
    if (event.data?.type === 'unbiased-visual-view-scale') {
      const scale = event.data.scale;
      if (typeof scale === 'number' && Number.isFinite(scale) && scale >= 0.75 && scale <= 2) {
        viewScale = scale;
        document.documentElement.style.zoom = String(scale);
        requestAnimationFrame(reportHeight);
      }
      return;
    }
    if (event.data?.type === 'unbiased-visual-preview-probe' && typeof event.data.requestId === 'string') {
      void probeInteractions(event.data.requestId).catch(error => {
        parent.postMessage({ type: 'unbiased-visual-preview-result', requestId: event.data.requestId,
          tested: 0, issues: ['Interaction probe failed: ' + String(error).slice(0, 160)] }, '*');
      });
      return;
    }
    if (event.data?.type !== 'unbiased-visual-theme') return;
    for (const [key, value] of Object.entries(event.data.colors ?? {})) {
      if (['bg', 'fg', 'muted', 'accent'].includes(key) && /^#[0-9a-f]{6}$/i.test(value))
        document.documentElement.style.setProperty('--visual-' + key, value);
    }
    requestAnimationFrame(() => { reportSurface(); scheduleContrast(); });
  });
  const reportSurface = () => {
    document.body.style.backgroundColor = '';
    const root = Array.from(document.body.children).find(el => el.tagName !== 'STYLE' && el.tagName !== 'SCRIPT');
    const color = root && getComputedStyle(root).backgroundColor;
    const surface = color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)'
      ? color : getComputedStyle(document.body).backgroundColor;
    document.body.style.backgroundColor = surface;
    parent.postMessage({ type: 'unbiased-visual-surface', color: surface }, '*');
  };
  const repairedText = new WeakMap();
  const rgb = value => {
    const match = /^rgba?[(] *([0-9.]+)[, ]+([0-9.]+)[, ]+([0-9.]+)(?:[, /]+([0-9.]+))? *[)]$/.exec(value);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : null;
  };
  const luminance = color => {
    const channels = color.slice(0, 3).map(value => {
      const linear = value / 255;
      return linear <= 0.04045 ? linear / 12.92 : Math.pow((linear + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const contrast = (a, b) => {
    const light = Math.max(luminance(a), luminance(b));
    const dark = Math.min(luminance(a), luminance(b));
    return (light + 0.05) / (dark + 0.05);
  };
  const backgroundFor = element => {
    for (let node = element; node; node = node.parentElement) {
      const color = rgb(getComputedStyle(node).backgroundColor);
      if (color && color[3] >= 0.95) return color;
    }
    return rgb(getComputedStyle(document.body).backgroundColor);
  };
  const repairTextContrast = () => {
    for (const element of document.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,small,li,summary,label,button,span,strong,em,b,div')) {
      if (!Array.from(element.childNodes).some(node => node.nodeType === 3 && node.textContent.trim())) continue;
      const previous = repairedText.get(element);
      if (previous) {
        if (previous.color) element.style.setProperty('color', previous.color, previous.priority);
        else element.style.removeProperty('color');
        repairedText.delete(element);
      }
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const ink = rgb(style.color);
      const paper = backgroundFor(element);
      if (!ink || !paper || contrast(ink, paper) >= 4.5) continue;
      const black = contrast([0, 0, 0], paper);
      const white = contrast([255, 255, 255], paper);
      repairedText.set(element, { color: element.style.getPropertyValue('color'), priority: element.style.getPropertyPriority('color') });
      element.style.setProperty('color', black > white ? '#000000' : '#ffffff', 'important');
    }
  };
  let contrastFrame = 0;
  const scheduleContrast = () => {
    if (contrastFrame || typeof document === 'undefined' || !document.defaultView ||
        typeof requestAnimationFrame !== 'function') return;
    contrastFrame = requestAnimationFrame(() => {
      contrastFrame = 0;
      if (typeof document !== 'undefined' && document.defaultView) repairTextContrast();
    });
  };
  addEventListener('DOMContentLoaded', () => {
    const issues = [];
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width + 2) issues.push('Horizontal overflow beyond the frame.');
    for (const el of document.querySelectorAll('p,h1,h2,h3,h4,button,label,span,li,svg text')) {
      if (issues.length >= 8) break;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const label = (el.textContent || '').trim().slice(0, 50);
      if (label && (box.right > width + 3 || box.left < -3)) issues.push('Text outside frame: ' + label);
    }
    parent.postMessage({ type: 'unbiased-visual-diagnostics', issues }, '*');
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(reportHeight).observe(document.body);
    reportSurface();
    repairTextContrast();
    if (typeof MutationObserver !== 'undefined' && typeof requestAnimationFrame === 'function') new MutationObserver(scheduleContrast).observe(document.body,
      { childList: true, characterData: true, subtree: true });
    document.body.addEventListener('click', scheduleContrast);
    document.body.addEventListener('input', scheduleContrast);
    reportHeight();
    parent.postMessage({ type: 'unbiased-visual-ready' }, '*');
  });
  })();
</script></head><body>${source}</body></html>`;
}
