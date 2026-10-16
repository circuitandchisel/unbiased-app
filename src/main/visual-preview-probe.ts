export type OpenUIControlState = {
  label: string;
  kind: "button" | "range";
  changed: boolean;
  outcome: string;
};

export function discoverOpenUIControls(selector: string): number {
  const previewWindow = window as Window & { __unbiasedPreviewControls?: Element[] };
  previewWindow.__unbiasedPreviewControls = [...document.querySelectorAll(selector)].slice(0, 8);
  return previewWindow.__unbiasedPreviewControls.length;
}

export async function probeOpenUIControl(index: number): Promise<OpenUIControlState> {
  const previewWindow = window as Window & { __unbiasedPreviewControls?: Element[] };
  const control = previewWindow.__unbiasedPreviewControls?.[index];
  if (!control) throw new Error("Preview control is missing");
  const beforeClone = document.querySelector(".app-openui-visual")?.cloneNode(true) as Element | undefined;
  beforeClone?.querySelectorAll("button, input[type=range], .iui-local-range").forEach((node) => node.remove());
  const before = beforeClone ? beforeClone.textContent + [...beforeClone.querySelectorAll("svg")].map((svg) => svg.outerHTML).join("") : "";
  const kind = control instanceof HTMLButtonElement ? "button" : "range";
  const label = (control.getAttribute("aria-label") || control.textContent || (kind === "range" ? "Slider" : "Button")).trim().slice(0, 60);
  if (control instanceof HTMLButtonElement) {
    control.click();
  } else if (control instanceof HTMLInputElement && control.type === "range") {
    const next = control.value === control.max ? control.min : control.max;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(control, next);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  const visual = document.querySelector(".app-openui-visual") as HTMLElement | null;
  const afterClone = visual?.cloneNode(true) as Element | undefined;
  afterClone?.querySelectorAll("button, input[type=range], .iui-local-range").forEach((node) => node.remove());
  const after = afterClone ? afterClone.textContent + [...afterClone.querySelectorAll("svg")].map((svg) => svg.outerHTML).join("") : "";
  return {
    label,
    kind,
    changed: after !== before,
    outcome: (visual?.innerText || visual?.textContent || "").trim().replace(/\s+/g, " ").slice(-180),
  };
}

export async function advanceFocusedSequence(): Promise<{ stage: number; total: number; sceneChanged: boolean; textChanged: boolean; outcome: string }> {
  const sequence = document.querySelector<HTMLElement>("[data-openui-focused-sequence]");
  const stage = sequence?.querySelector<HTMLElement>("[data-openui-stage]");
  const next = sequence?.querySelector<HTMLButtonElement>("[data-openui-next]");
  if (!sequence || !stage || !next || next.disabled) throw new Error("The next sequence stage is unavailable.");
  const beforeScene = [...stage.querySelectorAll("svg")].map((svg) => svg.outerHTML).join("");
  const beforeText = stage.textContent?.trim() ?? "";
  const beforeIndex = Number(stage.dataset.openuiStage);
  next.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const updated = sequence.querySelector<HTMLElement>("[data-openui-stage]");
  if (!updated || Number(updated.dataset.openuiStage) !== beforeIndex + 1) throw new Error("Next did not advance the sequence.");
  const afterScene = [...updated.querySelectorAll("svg")].map((svg) => svg.outerHTML).join("");
  return {
    stage: beforeIndex + 1,
    total: Number(sequence.dataset.openuiSlideCount),
    sceneChanged: Boolean(beforeScene && afterScene && beforeScene !== afterScene),
    textChanged: Boolean(beforeText && updated.textContent?.trim() && beforeText !== updated.textContent.trim()),
    outcome: updated.textContent?.trim().replace(/\s+/g, " ").slice(0, 180) ?? "",
  };
}
