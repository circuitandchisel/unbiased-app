import { parseFragment } from "parse5";

export const INTERACTIVE_VISUAL_SCHEME = "unbiased-visual";
export const MAX_INTERACTIVE_VISUAL_LENGTH = 128_000;
export const INTERACTIVE_VISUAL_PREVIEW_URL = `${INTERACTIVE_VISUAL_SCHEME}://preview/`;

export function isInteractiveVisualPreviewUrl(url: string): boolean {
  return url === INTERACTIVE_VISUAL_PREVIEW_URL;
}

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

export function interactiveVisualPreviewCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src data:",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

export function interactiveVisualPreviewDocument(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root { color-scheme: dark; scrollbar-gutter: stable; --visual-bg: #1f1f1f; --visual-fg: #f5f5f5; --visual-muted: #999; --visual-accent: #ff5546; }
* { box-sizing: border-box; } body { margin: 0; padding: 16px; min-width: 0; overflow-x: hidden; background: var(--visual-bg); color: var(--visual-fg); font: 14px/1.5 system-ui, sans-serif; }</style>
<style id="visual-preview-style"></style>
<script nonce="${nonce}">
(() => {
  const report = () => parent.postMessage({ type: 'unbiased-visual-preview-height', height: Math.ceil(document.body.scrollHeight) }, '*');
  const reconcile = (current, next) => {
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName || current.namespaceURI !== next.namespaceURI) {
      current.replaceWith(next);
      return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.textContent !== next.textContent) current.textContent = next.textContent;
      return;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return;
    for (const attribute of Array.from(current.attributes)) {
      if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    }
    for (const attribute of Array.from(next.attributes)) {
      if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
    }
    const existing = Array.from(current.childNodes);
    const incoming = Array.from(next.childNodes);
    for (let index = 0; index < incoming.length; index++) {
      if (existing[index]) reconcile(existing[index], incoming[index]);
      else current.appendChild(incoming[index]);
    }
    for (let index = incoming.length; index < existing.length; index++) existing[index].remove();
  };
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'unbiased-visual-preview') return;
    const { html, css, colors, scheme } = event.data;
    if (typeof html !== 'string' || html.length > 128000 || typeof css !== 'string' || css.length > 32000) return;
    for (const [key, value] of Object.entries(colors ?? {})) {
      if (['bg', 'fg', 'muted', 'accent'].includes(key) && /^#[0-9a-f]{6}$/i.test(value))
        document.documentElement.style.setProperty('--visual-' + key, value);
    }
    if (scheme === 'light' || scheme === 'dark') document.documentElement.style.colorScheme = scheme;
    const style = document.getElementById('visual-preview-style');
    if (style.textContent !== css) style.textContent = css;
    const template = document.createElement('template');
    template.innerHTML = html;
    const existing = Array.from(document.body.childNodes);
    const incoming = Array.from(template.content.childNodes);
    for (let index = 0; index < incoming.length; index++) {
      if (existing[index]) reconcile(existing[index], incoming[index]);
      else document.body.appendChild(incoming[index]);
    }
    for (let index = incoming.length; index < existing.length; index++) existing[index].remove();
    report();
  });
  addEventListener('DOMContentLoaded', () => {
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(report).observe(document.body);
    parent.postMessage({ type: 'unbiased-visual-preview-ready' }, '*');
  });
})();
</script></head><body></body></html>`;
}

export function isInteractiveVisualSource(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= MAX_INTERACTIVE_VISUAL_LENGTH &&
    /<[a-z][\s\S]*>/i.test(value) &&
    !/<\/?(?:html|head|body)\b|<!doctype\b/i.test(value);
}

/** Catch raw-text blocks that would consume the rest of a completed fragment. */
export function interactiveVisualSourceIssue(source: string): string | null {
  const tree = parseFragment(source, { sourceCodeLocationInfo: true });
  const visit = (node: typeof tree | (typeof tree.childNodes)[number]): string | null => {
    if ((node.nodeName === "style" || node.nodeName === "script") && "sourceCodeLocation" in node &&
        node.sourceCodeLocation && !("endTag" in node.sourceCodeLocation && node.sourceCodeLocation.endTag)) {
      return `The generated HTML has an unclosed <${node.nodeName}> block.`;
    }
    const children = "content" in node ? node.content.childNodes : "childNodes" in node ? node.childNodes : [];
    for (const child of children) { const issue = visit(child); if (issue) return issue; }
    return null;
  };
  return visit(tree);
}

export function interactiveVisualDocument(source: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: dark; scrollbar-gutter: stable; --visual-bg: #1f1f1f; --visual-fg: #f5f5f5; --visual-muted: #999; --visual-accent: #ff5546; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; min-width: 0; overflow-x: hidden; background: var(--visual-bg); color: var(--visual-fg); font: 14px/1.5 system-ui, sans-serif; }
  @media (max-width: 600px) { body { padding: 12px; } }
</style>
<script>
  (() => {
  let expanded = false;
  const reportFailure = (kind, detail) => {
    parent.postMessage({ type: 'unbiased-visual-error', kind, detail: String(detail || '').slice(0, 300) }, '*');
  };
  addEventListener('error', event => reportFailure('runtime-error', event.message));
  addEventListener('unhandledrejection', event => reportFailure('unhandled-rejection', event.reason));
  addEventListener('message', event => {
    if (event.source !== parent) return;
    if (event.data?.type === 'unbiased-visual-expanded') {
      expanded = event.data.expanded === true;
      return;
    }
    if (event.data?.type !== 'unbiased-visual-theme') return;
    for (const [key, value] of Object.entries(event.data.colors ?? {})) {
      if (['bg', 'fg', 'muted', 'accent'].includes(key) && /^#[0-9a-f]{6}$/i.test(value))
        document.documentElement.style.setProperty('--visual-' + key, value);
    }
    if (event.data.scheme === 'light' || event.data.scheme === 'dark')
      document.documentElement.style.colorScheme = event.data.scheme;
  });
  addEventListener('wheel', event => {
    if (!expanded || event.ctrlKey || event.defaultPrevented || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    for (let element = event.target; element instanceof Element; element = element.parentElement) {
      const scrollable = element === document.scrollingElement || /auto|scroll/.test(getComputedStyle(element).overflowY);
      if (scrollable && element.scrollHeight > element.clientHeight + 1 &&
          (event.deltaY < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1)) return;
    }
    event.preventDefault();
    parent.postMessage({ type: 'unbiased-visual-wheel', deltaY: event.deltaY, deltaMode: event.deltaMode }, '*');
  }, { passive: false });
  addEventListener('DOMContentLoaded', () => {
    let lastHeight = -1;
    const report = () => {
      const height = Math.ceil(document.body.scrollHeight);
      if (height === lastHeight) return;
      lastHeight = height;
      parent.postMessage({ type: 'unbiased-visual-height', height }, '*');
    };
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(report);
      observer.observe(document.body);
      observer.observe(document.documentElement);
    }
    report();
    // Loading an empty document is not a successful visual. Check locally;
    // ordinary static scenes become visible without waiting for a timer.
    const hasContent = () => typeof document !== 'undefined' && document.body && [document.body, ...document.body.querySelectorAll('*')].some(element => {
      if (element.matches('script,style,template,link,meta')) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const text = Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const graphic = element !== document.body && (element.matches('svg,canvas,img') || (style.backgroundColor !== 'transparent' && style.backgroundColor !== 'rgba(0, 0, 0, 0)'));
      return text || graphic;
    });
    let visible = hasContent();
    parent.postMessage({ type: 'unbiased-visual-ready', hasContent: visible }, '*');
    if (!visible) {
      const observer = new MutationObserver(() => {
        if (!hasContent()) return;
        visible = true; observer.disconnect();
        parent.postMessage({ type: 'unbiased-visual-ready', hasContent: true }, '*');
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      // Permit asynchronous drawing, without delaying already-visible scenes.
      setTimeout(() => {
        if (!visible && hasContent()) {
          visible = true; observer.disconnect();
          parent.postMessage({ type: 'unbiased-visual-ready', hasContent: true }, '*');
        }
        if (!visible) reportFailure('empty-render', 'The generated visual has no visible content.');
      }, 1000);
    }
  });
  })();
</script></head><body>${source}</body></html>`;
}
