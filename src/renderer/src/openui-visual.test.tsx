import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import spec from "@unbiased/iui/spec";
import { appOpenUILibrary, inspectOpenUI, inspectProgressiveOpenUI, ProgressiveVisualContext, VisualHostContext, visualFenceContent } from "./openui-visual";
import { openUIThemeStyle } from "./openui-theme";
import { VisualReadyContext } from "./visual-ready-context";
import { validateOpenUIForAgent } from "../../shared/visual-validation";
import { visualExportName } from "../../shared/visual-openui-policy";

test("visual export names cannot include paths or unsupported formats", () => {
  assert.equal(visualExportName("notes.txt"), "notes.txt");
  assert.equal(visualExportName("table.csv"), "table.csv");
  for (const name of ["../notes.txt", "sub/notes.txt", "notes.html", ".env.txt", " notes.txt", "notes.txt "]) {
    assert.equal(visualExportName(name), null, name);
  }
});

test("registers every published component in the app's single renderer", () => {
  for (const name of Object.keys(spec.components)) assert.ok(appOpenUILibrary.components[name], name);
  for (const name of ["Whiteboard", "VisualHtml"]) assert.ok(appOpenUILibrary.components[name]);
  for (const name of ["FlowDiagram", "Mermaid"]) assert.equal(appOpenUILibrary.components[name], undefined);
});

test("standard OpenUI chrome uses the host theme tokens", () => {
  const markup = renderToStaticMarkup(visualFenceContent("openui", 'root = Stack([TextContent("Theme")])', false)!);
  for (const token of [
    "--openui-background", "--openui-foreground", "--openui-popover-background", "--openui-sunk",
    "--openui-elevated", "--openui-elevated-strong", "--openui-text-neutral-primary",
    "--openui-text-neutral-secondary", "--openui-text-neutral-tertiary", "--openui-text-neutral-link",
    "--openui-text-brand", "--openui-border-default", "--openui-border-interactive",
    "--openui-border-interactive-emphasis", "--openui-interactive-accent-default", "--openui-font-body",
  ]) assert.match(markup, new RegExp(`${token}:var\\(--`), token);
  assert.match(markup, /--openui-interactive-accent-hover:color-mix\(in srgb, var\(--accent\)/);
});

test("OpenUI interaction and semantic states do not fall back to the OS palette", () => {
  const tokens = openUIThemeStyle as Record<string, string>;
  for (const key of [
    "--openui-highlight", "--openui-text-accent-primary", "--openui-interactive-accent-disabled",
    "--openui-border-accent", "--openui-success-background", "--openui-text-success-primary",
    "--openui-danger-background", "--openui-text-danger-primary", "--openui-border-danger",
    "--openui-info-background", "--openui-alert-background", "--openui-font-code",
  ]) {
    assert.ok(tokens[key], key);
    assert.doesNotMatch(tokens[key], /oklch|\bInter\b/, key);
  }
  assert.equal(tokens["--openui-text-accent-primary"], "var(--accent-fg)");
});

test("validates complete programs and rejects unsupported or unsafe content", () => {
  assert.equal(inspectOpenUI('root = Stack([TextContent("Hello")])').valid, true);
  assert.equal(inspectOpenUI('root = Stack([Table([Col("Name", ["Ada"])])])').valid, true);
  assert.equal(inspectOpenUI('root = Stack([Mermaid("flowchart LR\\nA-->B")])').valid, false);
  assert.equal(inspectOpenUI('root = Stack([FlowDiagram("Process", [], [])])').valid, false);
  assert.equal(inspectOpenUI('root = Stack([Unknown("oops")])').valid, false);
  assert.equal(inspectOpenUI('root = Stack([TextContent("https://example.com")])').valid, false);
  assert.equal(inspectOpenUI('root = Stack([TextContent("unfinished")').valid, false);
  assert.equal(inspectOpenUI("x".repeat(256_001)).valid, false);
  const board = 'root = Stack([Whiteboard("Graph", [{id:"a",type:"circle",x:1,y:1,width:40},{id:"b",type:"circle",x:100,y:1,width:40},{id:"e",type:"connector",from:"a",to:"b"}])])';
  assert.deepEqual(inspectOpenUI(board), { valid: true, selfFramed: true });
  assert.equal(inspectOpenUI(board.replace('to:"b"', 'to:"missing"')).valid, false);
  const steps = 'root = Stack([GuidedExplainer("Journey", "Summary", [{id:"same",title:"One",heading:"First",description:"Start"},{id:"same",title:"Two",heading:"Second",description:"Finish"}])])';
  assert.equal(inspectOpenUI(steps).valid, false);
  const scene = 'Scene("Sunrise", "#10202E", [{id:"sun",kind:"circle",x:600,y:120,width:110,fill:"#F8C46A"}])';
  assert.deepEqual(inspectOpenUI(`root = Stack([${scene}])`), { valid: true, selfFramed: true });
  const paletteScene = 'PaletteScene("Sunrise", "blue", [{id:"sun",kind:"circle",x:600,y:120,width:110,fill:"accent"}])';
  assert.deepEqual(inspectOpenUI(`root = Stack([${paletteScene}])`), { valid: true, selfFramed: true });
  const clippedDunes = 'root = Stack([Scene("Dunes", "#C8552A", [{id:"near",kind:"ellipse",x:-100,y:500,width:800,height:260,fill:"#A0522D"},{id:"wide",kind:"ellipse",x:0,y:350,width:1200,height:400,fill:"#DEB887"}])])';
  assert.deepEqual(inspectOpenUI(clippedDunes), { valid: true, selfFramed: true });
  assert.equal(inspectOpenUI(`root = Stack([${scene.replace('fill:"#F8C46A"', 'fill:"url(javascript:bad)"')}])`).valid, false);
  assert.equal(inspectOpenUI(`root = Stack([${scene.replace('}])', '},{id:"sun",kind:"text",x:1,y:1,label:"duplicate"}])')}])`).valid, false);
  const sequence = `root = Stack([Sequence("Journey", [SequenceSlide("First", [${scene}, TextContent("Depart")]), SequenceSlide("Last", [TextContent("Arrive")])])])`;
  assert.deepEqual(inspectOpenUI(sequence), { valid: true, selfFramed: true });
  const slider = 'root = Stack([StateScope(0, 28, 0, [Slider("Lunar day", 1, "days"), StateView([StateCase(0, 13, [TextContent("Waxing")]), StateCase(14, 28, [TextContent("Waning")])])])])';
  assert.deepEqual(inspectOpenUI(slider), { valid: true, selfFramed: true });
  assert.equal(inspectOpenUI(slider.replace("StateCase(14, 28", "StateCase(15, 28")).valid, false);
  const animatedScene = 'StateScene("Orbit", "#101827", [{at:0,shapes:[{id:"moon",kind:"circle",x:100,y:200,width:40,fill:"#FFFFFF"}]},{at:28,shapes:[{id:"moon",kind:"circle",x:600,y:200,width:40,fill:"#FFFFFF"}]}])';
  assert.equal(inspectOpenUI(slider.replace('StateView([', `${animatedScene}, StateView([`)).valid, true);
  const choices = 'root = Stack([ChoiceGroup("Compare", [ChoiceOption("one", "One", [HotspotVisual("Inspect", Scene("A", "#101010", [{id:"dot",kind:"circle",x:100,y:100,width:20,fill:"#FFFFFF"}]), [Hotspot("dot", "Dot", "A white dot", 100, 100)])]), ChoiceOption("two", "Two", [TextContent("Another view")])])])';
  assert.equal(inspectOpenUI(choices).valid, true);
  assert.equal(inspectOpenUI(choices.replace('ChoiceOption("two"', 'ChoiceOption("one"')).valid, false);
  assert.equal(inspectOpenUI('root = Stack([ImageAsset("https://example.com/a.png", "A")])').valid, false);
});

test("final renderer acceptance matches the agent's validator", () => {
  const programs = [
    'root = Stack([TextContent("Hello")])',
    `root = Stack([Timeline("Journey", [Milestone("Troy", "${"x".repeat(241)}"), Milestone("Ithaca", "Home")])])`,
    'root = Stack([TextContent("unfinished")',
    'root = Stack([Whiteboard("Graph", [{id:"a",type:"circle",x:1,y:1,width:40}])])',
  ];
  for (const source of programs) {
    assert.equal(inspectOpenUI(source).valid, validateOpenUIForAgent(source).valid);
  }
});

test("hides source while streaming and after validation failure", () => {
  const source = 'root = Stack([TextContent("private visual source")])';
  const pending = renderToStaticMarkup(visualFenceContent("openui", source, true)!);
  assert.match(pending, /Preparing visual/);
  assert.doesNotMatch(pending, /private visual source/);
  const failed = renderToStaticMarkup(visualFenceContent("openui", "root = Stack([", false)!);
  assert.match(failed, /couldn&#x27;t be displayed/);
  assert.equal(visualFenceContent("json", source, false), null);
  assert.equal(visualFenceContent("mermaid", "flowchart LR\nA-->B", false), null);
});

test("accepts safe partial OpenUI but holds host widgets and unsafe chunks", () => {
  assert.equal(inspectProgressiveOpenUI('root = Stack([TextContent("Hello")').valid, true);
  assert.equal(inspectProgressiveOpenUI('root = Stack([TextContent("Hel').valid, true);
  assert.equal(inspectProgressiveOpenUI('root = Stack([TextContent("A first scene"), PaletteScene("Example", "blue", [{id:"piece",kind:"circle",x:300,y:300,width:80,fill:"accent"}])])').valid, true);
  assert.equal(inspectProgressiveOpenUI('root = Stack([').reason, "no-component");
  assert.equal(inspectProgressiveOpenUI('root = Stack([Mermaid("flowchart LR').valid, false);
  assert.equal(inspectProgressiveOpenUI('root = Stack([VisualHtml("<div>').reason, "settled-only");
  assert.equal(inspectProgressiveOpenUI('root = Stack([LocalButton("Next", @Set($mode, "next"))').reason, "settled-only");
  assert.equal(inspectProgressiveOpenUI('root = Stack([Button("Ask", @ToAssistant("more"))').reason, "settled-only");
  assert.equal(inspectProgressiveOpenUI('root = Stack([TextContent("https://example.com")').reason, "content");
  assert.equal(inspectOpenUI('root = Stack([TextContent("Hello")').valid, false);
});

test("standard OpenUI actions reach only the host callback", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const events: Array<{ type: string; message: string }> = [];
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  Object.assign(globalThis, { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
  try {
    await act(async () => root.render(
      <VisualHostContext.Provider value={{
        onAction: (event) => events.push({ type: event.type, message: event.humanFriendlyMessage }),
        confirmWrite: async () => false,
        confirmRead: async () => false,
      }}>
        {visualFenceContent("openui", 'root = Stack([Button("Ask", @ToAssistant("More detail")), Button("Source", @OpenUrl("https://example.com"))])', false)}
      </VisualHostContext.Provider>,
    ));
    const buttons = [...dom.window.document.querySelectorAll("button")];
    const ask = buttons.find((button) => button.textContent?.trim() === "Ask");
    const source = buttons.find((button) => button.textContent?.trim() === "Source");
    assert.ok(ask);
    assert.ok(source);
    await act(async () => { ask.click(); source.click(); });
    assert.deepEqual(events, [
      { type: "continue_conversation", message: "More detail" },
      { type: "open_url", message: "" },
    ]);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, { requestAnimationFrame: previousRequestAnimationFrame, cancelAnimationFrame: previousCancelAnimationFrame });
    dom.window.close();
  }
});

test("approved OpenUI mutation waits for host confirmation before writing", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  const writes: string[] = [];
  const previousClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, "clipboard");
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { writes.push(value); } } });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  Object.assign(globalThis, { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
  let confirms = 0;
  try {
    await act(async () => root.render(
      <VisualHostContext.Provider value={{ onAction: () => {}, confirmWrite: async () => { confirms++; return true; }, confirmRead: async () => false }}>
        {visualFenceContent("openui", 'root = Stack([Button("Copy", @Run(copy))])\ncopy = Mutation("visual_copy_text", {text:"Approved text"})', false)}
      </VisualHostContext.Provider>,
    ));
    const copy = [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Copy");
    assert.ok(copy);
    await act(async () => { copy.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    assert.equal(confirms, 1);
    assert.deepEqual(writes, ["Approved text"]);
  } finally {
    await act(async () => root.unmount());
    if (previousClipboard) Object.defineProperty(globalThis.navigator, "clipboard", previousClipboard);
    else Reflect.deleteProperty(globalThis.navigator, "clipboard");
    Object.assign(globalThis, { requestAnimationFrame: previousRequestAnimationFrame, cancelAnimationFrame: previousCancelAnimationFrame });
    dom.window.close();
  }
});

test("text export waits for confirmation and uses only the approved save API", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  const saves: Array<{ name: string; text: string }> = [];
  Object.assign(dom.window, { unbiased: { visualSaveText: async (name: string, text: string) => {
    saves.push({ name, text });
    return { ok: true };
  } } });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  Object.assign(globalThis, { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
  let approved = false;
  let confirms = 0;
  try {
    await act(async () => root.render(
      <VisualHostContext.Provider value={{ onAction: () => {}, confirmRead: async () => false,
        confirmWrite: async () => { confirms++; return approved; } }}>
        {visualFenceContent("openui", 'root = Stack([Button("Save", @Run(save))])\nsave = Mutation("visual_save_text", {name:"notes.txt",text:"Example"})', false)}
      </VisualHostContext.Provider>,
    ));
    const save = [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Save");
    assert.ok(save);
    await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    assert.equal(confirms, 1);
    assert.deepEqual(saves, []);
    approved = true;
    await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    assert.equal(confirms, 2);
    assert.deepEqual(saves, [{ name: "notes.txt", text: "Example" }]);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, { requestAnimationFrame: previousRequestAnimationFrame, cancelAnimationFrame: previousCancelAnimationFrame });
    dom.window.close();
  }
});

test("clipboard query cannot read without host confirmation", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  let reads = 0;
  Object.assign(dom.window, { unbiased: { visualReadClipboardText: async () => {
    reads++;
    return { ok: true, text: "private" };
  } } });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  Object.assign(globalThis, { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
  let confirms = 0;
  try {
    await act(async () => root.render(
      <VisualHostContext.Provider value={{ onAction: () => {}, confirmWrite: async () => false,
        confirmRead: async () => { confirms++; return false; } }}>
        {visualFenceContent("openui", 'root = Stack([TextContent(clip.text)])\nclip = Query("visual_read_clipboard_text", {}, {ok:false,text:""})', false)}
      </VisualHostContext.Provider>,
    ));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    assert.equal(confirms, 1);
    assert.equal(reads, 0);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, { requestAnimationFrame: previousRequestAnimationFrame, cancelAnimationFrame: previousCancelAnimationFrame });
    dom.window.close();
  }
});

test("renders progressively, retains the last safe view, and settles without remounting", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const events: string[] = [];
  let readyFrame: FrameRequestCallback | null = null;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => { readyFrame = callback; return 1; },
    cancelAnimationFrame: () => { readyFrame = null; },
  });
  dom.window.requestAnimationFrame = (callback) => { readyFrame = callback; return 1; };
  dom.window.cancelAnimationFrame = () => { readyFrame = null; };
  const render = async (source: string, streaming: boolean) => act(async () => root.render(
    <ProgressiveVisualContext.Provider value={{ enabled: true, onEvent: (event) => events.push(event.kind) }}>
      {visualFenceContent("openui", source, streaming, true)}
    </ProgressiveVisualContext.Provider>,
  ));
  try {
    await render('root = Stack([TextContent("First")', true);
    assert.match(dom.window.document.body.textContent ?? "", /First/);
    const surface = dom.window.document.querySelector('[aria-label="Interactive visual"]');
    assert.ok(surface);
    assert.ok(readyFrame);
    (readyFrame as FrameRequestCallback)(0);
    assert.ok(readyFrame);
    (readyFrame as FrameRequestCallback)(0);
    assert.ok(events.includes("paint"));

    await render('root = Stack([TextContent("https://example.com")', true);
    assert.match(dom.window.document.body.textContent ?? "", /First/);
    assert.doesNotMatch(dom.window.document.body.textContent ?? "", /example.com/);
    assert.ok(events.includes("rejected"));

    await render('root = Stack([TextContent("Final")])', false);
    assert.match(dom.window.document.body.textContent ?? "", /Final/);
    assert.equal(dom.window.document.querySelector('[aria-label="Interactive visual"]') === surface, true);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, {
      requestAnimationFrame: previousRequestAnimationFrame,
      cancelAnimationFrame: previousCancelAnimationFrame,
    });
    dom.window.close();
  }
});

test("renders a library component through OpenUI", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let readyFrame: FrameRequestCallback | null = null;
  let readyCount = 0;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => { readyFrame = callback; return 1; },
    cancelAnimationFrame: () => { readyFrame = null; },
  });
  dom.window.requestAnimationFrame = (callback) => { readyFrame = callback; return 1; };
  dom.window.cancelAnimationFrame = () => { readyFrame = null; };
  try {
    await act(async () => root.render(
      <VisualReadyContext.Provider value={() => { readyCount++; }}>
        {visualFenceContent("openui", 'root = Stack([TextContent("Hello from OpenUI"), Table([Col("Name", ["Ada"]), Col("Role", ["Engineer"])])])', false)}
      </VisualReadyContext.Provider>,
    ));
    assert.match(dom.window.document.body.textContent ?? "", /Hello from OpenUI/);
    assert.match(dom.window.document.body.textContent ?? "", /Engineer/);
    assert.ok(dom.window.document.querySelector("table"));
    assert.ok(dom.window.document.querySelector('[aria-label="Interactive visual"]'));
    assert.ok(readyFrame);
    (readyFrame as FrameRequestCallback)(0);
    assert.ok(readyFrame);
    (readyFrame as FrameRequestCallback)(0);
    assert.equal(readyCount, 1);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, {
      requestAnimationFrame: previousRequestAnimationFrame,
      cancelAnimationFrame: previousCancelAnimationFrame,
    });
    dom.window.close();
  }
});

test("displays legacy standalone HTML in a sandboxed frame without allowing new HTML programs", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(dom.window, { unbiased: { registerVisual: async () => "unbiased-visual://view/test-id" } });
  const source = '<button id="secret-source">Next</button><script>document.querySelector("button").onclick=()=>{}</script>';
  const pending = renderToStaticMarkup(visualFenceContent("visual-html", source, true)!);
  assert.match(pending, /Preparing visual/);
  assert.doesNotMatch(pending, /secret-source/);
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(visualFenceContent("visual-html", source, false)));
    const frame = dom.window.document.querySelector("iframe");
    assert.ok(frame);
    assert.equal(frame.getAttribute("sandbox"), "allow-scripts");
    assert.equal(frame.getAttribute("src"), "unbiased-visual://view/test-id");
    const viewport = frame.closest(".app-generated-visual-viewport");
    assert.ok(viewport);
    assert.equal(viewport.querySelectorAll(".app-generated-visual-viewport__toggle").length, 1);
    assert.equal(dom.window.document.querySelectorAll(".app-generated-visual-viewport__toggle").length, 1);
    assert.doesNotMatch(dom.window.document.body.innerHTML, /secret-source/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("FocusedSequence changes the illustrated stage with Back and Next", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const source = 'root = Stack([FocusedSequence("Paper", [SequenceSlide("Flat", [PaletteScene("Sheet", "white", [{id:"paper",kind:"rect",x:200,y:100,width:600,height:400,fill:"surface"}]), TextContent("Lay the sheet flat.")]), SequenceSlide("Folded", [PaletteScene("Folded sheet", "white", [{id:"paper",kind:"rect",x:200,y:100,width:300,height:400,fill:"surface"}]), TextContent("Press the new crease.")])])])';
  assert.equal(inspectOpenUI(source).valid, true);
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(visualFenceContent("openui", source, false)));
    const sequence = dom.window.document.querySelector("[data-openui-focused-sequence]")!;
    assert.equal(sequence.querySelector("[data-openui-stage]")?.getAttribute("data-openui-stage"), "1");
    assert.match(sequence.textContent ?? "", /Lay the sheet flat/);
    await act(async () => (sequence.querySelector("[data-openui-next]") as HTMLButtonElement).click());
    assert.equal(sequence.querySelector("[data-openui-stage]")?.getAttribute("data-openui-stage"), "2");
    assert.match(sequence.textContent ?? "", /Press the new crease/);
    await act(async () => (sequence.querySelector(".app-focused-sequence__controls button") as HTMLButtonElement).click());
    assert.equal(sequence.querySelector("[data-openui-stage]")?.getAttribute("data-openui-stage"), "1");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
