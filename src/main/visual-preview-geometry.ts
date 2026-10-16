export type VisualPreviewGeometry = { height: number; issues: string[] };

// Serialized into the isolated preview renderer, where DOM geometry is available.
export function inspectVisualPreviewGeometry(): VisualPreviewGeometry {
  const width = document.documentElement.clientWidth;
  const height = Math.min(1400, Math.max(320, Math.ceil(document.documentElement.scrollHeight)));
  const issues: string[] = [];
  const reported = (window as Window & { __visualPreviewIssues?: unknown }).__visualPreviewIssues;
  if (Array.isArray(reported)) issues.push(...reported);
  if (document.documentElement.scrollWidth > width + 2) issues.push("Horizontal overflow: content extends beyond the preview width.");
  if (document.querySelector(".app-openui-status")) issues.push("The component renderer displayed its fallback instead of the visual.");

  for (const element of document.querySelectorAll("p,h1,h2,h3,h4,button,label,span,li,svg text")) {
    if (issues.length >= 8) break;
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const label = (element.textContent || "").trim().slice(0, 50);
    if (!label) continue;
    if (box.right > width + 3 || box.left < -3) {
      let reachable = false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (!/^(auto|scroll)$/.test(style.overflowX) || parent.scrollWidth <= parent.clientWidth + 2) continue;
        const frame = parent.getBoundingClientRect();
        if (frame.left < -3 || frame.right > width + 3 || box.width > parent.clientWidth + 3) continue;
        const left = box.left - frame.left + parent.scrollLeft;
        const right = box.right - frame.left + parent.scrollLeft;
        if (left >= -3 && right <= parent.scrollWidth + 3) {
          reachable = true;
          break;
        }
      }
      if (!reachable) issues.push(`Text outside viewport: ${label}`);
    } else if (element.scrollWidth > element.clientWidth + 3 && getComputedStyle(element).overflowX !== "visible") {
      issues.push(`Clipped text: ${label}`);
    }
  }
  return { height, issues };
}
