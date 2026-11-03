import type { WebContents } from "electron";
import type { Locator } from "playwright-core";

// Separate from the site's JS world. The marker cannot take input or enter snapshots.
const CURSOR_WORLD = 1008;
type CursorPoint = { x: number; y: number };
// Plain page script so TS/bundler helper functions cannot escape into the page.
const PAINT_CURSOR = String.raw`(function (options) {
  const state = globalThis;
  const old = state.__unbiasedCursor;
  if (old?.timer) clearTimeout(old.timer);
  if (options.mode === "hide") { old?.node.remove(); delete state.__unbiasedCursor; return; }
  let node = old?.node;
  if (!node?.isConnected) {
    node = document.createElement("unbiased-agent-cursor");
    node.setAttribute("data-unbiased-agent-cursor", "");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("popover", "manual");
    const style = {
      position: "fixed", inset: "auto", width: "132px", height: "132px", margin: "0", padding: "0", border: "0",
      display: "block", background: "transparent", overflow: "visible", pointerEvents: "none", userSelect: "none", zIndex: "2147483647",
    };
    for (const [key, value] of Object.entries(style)) node.style.setProperty(key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase()), value, "important");
    const shadow = node.attachShadow({ mode: "closed" });
    const svgNode = (name, attributes) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", name);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      return element;
    };
    const svg = svgNode("svg", { width: "132", height: "132", viewBox: "0 0 132 132", "aria-hidden": "true" });
    svg.style.setProperty("pointer-events", "none", "important");
    const defs = svgNode("defs", {});
    const gradient = svgNode("radialGradient", { id: "glow" });
    for (const [offset, opacity] of [["0", "0.58"], ["0.45", "0.24"], ["1", "0"]]) gradient.appendChild(svgNode("stop", { offset, "stop-color": "#F8573B", "stop-opacity": opacity }));
    defs.appendChild(gradient); svg.appendChild(defs);
    svg.appendChild(svgNode("circle", { cx: "66", cy: "66", r: "55.44", fill: "url(#glow)" }));
    // Same outline geometry and colors as the computer-use AgentCursor.
    for (const [stroke, width] of [["#00000061", "4.4"], ["#FF7764", "2.1"]]) svg.appendChild(svgNode("path", {
      d: "M0 0L17.5 7L8 8L7 17.5Z", transform: "translate(57.25 57.25)", fill: "none", stroke,
      "stroke-width": width, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
    shadow.appendChild(svg); document.documentElement.appendChild(node);
    // Top layer keeps it visible above website dialogs, without focusing anything.
    try { node.showPopover(); } catch { node.removeAttribute("popover"); }
  }
  const x = Math.max(0, Math.min(options.point.x, innerWidth - 20));
  const y = Math.max(0, Math.min(options.point.y, innerHeight - 20));
  node.style.setProperty("left", (x - 57.25) + "px", "important");
  node.style.setProperty("top", (y - 57.25) + "px", "important");
  node.style.setProperty("opacity", "1", "important");
  node.style.setProperty("transition", "opacity 180ms ease-out", "important");
  const current = { node, timer: undefined };
  state.__unbiasedCursor = current;
  if (options.mode === "idle") current.timer = setTimeout(() => {
    node.style.setProperty("opacity", "0", "important");
  }, 1400);
})`;

/** Cosmetic page-local cursor; never sends OS mouse input or reveals the window. */
export class InAppBrowserCursor {
  private point: CursorPoint = { x: 36, y: 36 };
  private active = false;
  private suppressed = 0;
  private disposed = false;
  private readonly onReady = () => { if (this.active) void this.paint("active"); };
  constructor(private contents: WebContents) { contents.on("dom-ready", this.onReady); }
  private async paint(mode: "active" | "idle" | "hide"): Promise<void> {
    if (this.contents.isDestroyed() || (mode !== "hide" && this.suppressed > 0)) return;
    try {
      await this.contents.executeJavaScriptInIsolatedWorld(CURSOR_WORLD, [{ code: `(${PAINT_CURSOR})(${JSON.stringify({ point: this.point, mode })})` }]);
    } catch { /* A navigation, CSP or closed page must not break the action. */ }
  }
  async begin(): Promise<void> { if (!this.disposed) { this.active = true; await this.paint("active"); } }
  async end(): Promise<void> { if (this.active && !this.disposed) { this.active = false; await this.paint("idle"); } }
  async move(x: number, y: number): Promise<void> { this.point = { x, y }; if (this.active && !this.disposed) await this.paint("active"); }
  async pointAt(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (box) await this.move(box.x + box.width / 2, box.y + box.height / 2);
  }
  async withoutMarker<T>(action: () => Promise<T>): Promise<T> {
    this.suppressed++;
    await this.paint("hide");
    try { return await action(); }
    finally { this.suppressed--; if (this.active && !this.disposed) await this.paint("active"); }
  }
  async hide(): Promise<void> { this.active = false; await this.paint("hide"); }
  async dispose(): Promise<void> { this.disposed = true; this.contents.off("dom-ready", this.onReady); await this.hide(); }
}
