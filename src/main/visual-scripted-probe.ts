export type ScriptedProbeResult = {
  tested: number;
  issues: string[];
  states: { label: string; outcome: string }[];
  navigationOnly: boolean;
};

export async function probeScriptedVisual(): Promise<ScriptedProbeResult> {
  const frame = document.querySelector<HTMLIFrameElement>(".app-openui-visual iframe");
  if (!frame?.contentWindow || frame.style.visibility !== "visible") {
    return { tested: 0, issues: ["Scripted visual frame is not ready."], states: [], navigationOnly: false };
  }
  const frameWindow = frame.contentWindow;
  const requestId = `probe-${Date.now()}-${Math.random()}`;
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", receive);
      resolve({ tested: 0, issues: ["Scripted visual interaction probe timed out."], states: [], navigationOnly: false });
    }, 4500);
    function receive(event: MessageEvent) {
      if (event.source !== frameWindow || event.origin !== "null" ||
          event.data?.type !== "unbiased-visual-preview-result" || event.data.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      const data = event.data;
      resolve({
        tested: Number.isInteger(data.tested) && data.tested >= 0 ? data.tested : 0,
        issues: Array.isArray(data.issues) ? data.issues.filter((issue: unknown) => typeof issue === "string").slice(0, 8) : [],
        states: Array.isArray(data.states) ? data.states.filter((state: unknown) =>
          state && typeof state === "object" && typeof (state as { label?: unknown }).label === "string" &&
          typeof (state as { outcome?: unknown }).outcome === "string").slice(0, 8) : [],
        navigationOnly: data.navigationOnly === true,
      });
    }
    window.addEventListener("message", receive);
    frameWindow.postMessage({ type: "unbiased-visual-preview-probe", requestId }, "*");
  });
}
