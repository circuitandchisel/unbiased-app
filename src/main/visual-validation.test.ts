import assert from "node:assert/strict";
import test from "node:test";
import { createVisualValidationBudget, openUIVisualHtmlSources, validateOpenUIForAgent, validateVisualHtmlForAgent, validateVisualizeDraft } from "../shared/visual-validation";

test("visualize accepts a small static scene and rejects executable or interactive drafts", () => {
  const scene = 'root = Stack([TextContent("Move diagonally"), PaletteScene("Board", "blue", [{id:"piece",kind:"circle",x:300,y:300,width:80,fill:"accent"}])])';
  assert.deepEqual(validateVisualizeDraft(scene), { valid: true, errors: [] });
  assert.equal(validateVisualizeDraft('root = Stack([TextContent("Wait"), Button("Send", @ToAssistant("Go"))])').valid, false);
  assert.equal(validateVisualizeDraft('root = Stack([TextContent("State"), LocalView($mode == "a", [TextContent("A")])])\n$mode = "a"').valid, false);
  assert.equal(validateVisualizeDraft('root = Stack([VisualHtml("<div data-visual-scene>Hi</div><p data-visual-outcome>Hi</p><script>document.body.textContent=\"Hi\"</script>")])').valid, false);
  assert.equal(validateVisualizeDraft('root = Stack([TextContent("' + "a".repeat(32_000) + '")])').valid, false);
});

test("visual validation permits one correction per turn and resets for the next turn", () => {
  const budget = createVisualValidationBudget();
  assert.equal(budget.remaining("thread", "turn-1"), 2);
  assert.equal(budget.tryUse("thread", "turn-1"), true);
  assert.equal(budget.remaining("thread", "turn-1"), 1);
  assert.equal(budget.tryUse("thread", "turn-1"), true);
  assert.equal(budget.remaining("thread", "turn-1"), 0);
  assert.equal(budget.tryUse("thread", "turn-1"), false);
  assert.equal(budget.tryUse("thread", "turn-2"), true);
  assert.equal(budget.remaining("thread", "turn-2"), 1);
  budget.clear("thread");
  assert.equal(budget.tryUse("thread", "turn-2"), true);
});

test("structural corrections do not spend rendered preview attempts", () => {
  const renderBudget = createVisualValidationBudget(2);
  const structureBudget = createVisualValidationBudget(4);
  const invalid = "root = Stack([Scene(";
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(validateOpenUIForAgent(invalid).valid, false);
    assert.equal(structureBudget.tryUse("thread", "turn"), true);
  }
  assert.equal(structureBudget.remaining("thread", "turn"), 2);
  assert.equal(renderBudget.remaining("thread", "turn"), 2);
  assert.equal(validateOpenUIForAgent('root = Stack([TextContent("Catan")])').valid, true);
  assert.equal(renderBudget.tryUse("thread", "turn"), true);
  assert.equal(renderBudget.remaining("thread", "turn"), 1);
});

test("sandboxed VisualHtml can be authored inside OpenUI while retaining fragment and size limits", () => {
  const fragment = '<div data-visual-scene><button type="button">Step</button><svg viewBox="0 0 600 240"></svg></div><p data-visual-outcome>Start</p><script>for(let i=0;i<8;i++){document.querySelector("svg").insertAdjacentHTML("beforeend",`<circle cx="${i*20}" cy="20" r="5"/>`)};</script>';
  assert.deepEqual(validateVisualHtmlForAgent(fragment), { valid: true, errors: [] });
  assert.equal(validateVisualHtmlForAgent("<!doctype html><html><body>Hi</body></html>").valid, false);
  assert.equal(validateVisualHtmlForAgent("<svg>" + "x".repeat(128_000) + "</svg>").valid, false);
  assert.equal(validateVisualHtmlForAgent("plain text").valid, false);
  const source = `root = Stack([VisualHtml(${JSON.stringify(fragment)})])`;
  assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] });
  assert.deepEqual(openUIVisualHtmlSources(source), [fragment]);
  assert.equal(validateOpenUIForAgent(`root = Stack([VisualHtml(${JSON.stringify(fragment)}), VisualHtml(${JSON.stringify(fragment)})])`).valid, false);
  assert.equal(validateOpenUIForAgent(`root = Stack([VisualHtml(${JSON.stringify("<!doctype html><html></html>")})])`).valid, false);
});

test("a complete illustrated sequence accepts lines pointing left and up", () => {
  const source = `root = Stack([Sequence("Dune", [
    SequenceSlide("The trap", [Scene("Houses", "#202537", [
      {id:"link",kind:"line",x:275,y:285,width:183,height:-65,stroke:"#7FC0B1"}
    ])]),
    SequenceSlide("The futures", [Scene("Paths", "#152936", [
      {id:"future",kind:"line",x:492,y:305,width:-250,height:-145,stroke:"#69B9B3"}
    ])])
  ])])`;
  assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] });
});

test("FocusedSequence requires a changed scene and explanation at each stage", () => {
  const first = 'SequenceSlide("Fold", [PaletteScene("Paper", "white", [{id:"sheet",kind:"rect",x:200,y:100,width:600,height:400,fill:"surface"}]), TextContent("Fold the sheet.")])';
  const second = 'SequenceSlide("Crease", [PaletteScene("Crease", "white", [{id:"sheet",kind:"rect",x:200,y:100,width:300,height:400,fill:"surface"}]), TextContent("Press the crease.")])';
  const source = `root = Stack([FocusedSequence("Paper", [${first}, ${second}])])`;
  assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] });
  assert.match(validateOpenUIForAgent(`root = Stack([FocusedSequence("Paper", [${first}, ${first}])])`).errors.join(" "), /repeats the previous illustration/);
  assert.match(validateOpenUIForAgent(source.replace('TextContent("Press the crease.")', 'TextContent("Fold the sheet.")')).errors.join(" "), /repeats the previous explanation/);
});

test("a composed scene accepts curved objects, polygons, and arrowheads", () => {
  const source = `root = Stack([Scene("The bow", "#1B2935", [
    {id:"limb",kind:"path",x:300,y:80,points:[{x:150,y:300,cx:80,cy:180},{x:300,y:520,cx:80,cy:420}],stroke:"#E0A55F",strokeWidth:16,label:"Bow"},
    {id:"shaft",kind:"line",x:200,y:300,width:590,height:0,stroke:"#F4D2A0",arrowEnd:true},
    {id:"feather",kind:"polygon",x:200,y:300,points:[{x:170,y:275},{x:220,y:290}],fill:"#CC7669"}
  ])])`;
  assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] });
  assert.equal(validateOpenUIForAgent(source.replace("cx:80,cy:180", "cx:80")).valid, false);
});

test("validation gives an actionable shape error before the final answer", () => {
  const source = `root = Stack([Scene("Bad", "#000000", [
    {id:"box",kind:"rect",x:500,y:300,width:-250,height:100,fill:"#FFFFFF"}
  ])])`;
  const result = validateOpenUIForAgent(source);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Scene shapes\.0|Only lines may use negative/);
});

test("validation rejects unsafe URLs and unfinished programs", () => {
  assert.equal(validateOpenUIForAgent('root = Stack([TextContent("https://example.com")])').valid, false);
  assert.equal(validateOpenUIForAgent("root = Stack([Scene(").valid, false);
});

test("validation accepts a scoped slider and rejects missing phase coverage", () => {
  const valid = 'root = Stack([StateScope(0, 28, 0, [Slider("Lunar day", 1, "days"), StateView([StateCase(0, 13, [TextContent("Waxing")]), StateCase(14, 28, [TextContent("Waning")])])])])';
  assert.deepEqual(validateOpenUIForAgent(valid), { valid: true, errors: [] });
  const gap = valid.replace("StateCase(14, 28", "StateCase(15, 28");
  assert.match(validateOpenUIForAgent(gap).errors.join(" "), /without gaps or overlaps/);
  const scene = 'StateScene("Orbit", "#101827", [{at:0,shapes:[{id:"moon",kind:"circle",x:100,y:200,width:40,fill:"#FFFFFF"}]},{at:28,shapes:[{id:"moon",kind:"circle",x:600,y:200,width:40,fill:"#FFFFFF"}]}])';
  const animated = valid.replace('StateView([', `${scene}, StateView([`);
  assert.equal(validateOpenUIForAgent(animated).valid, true);
  assert.match(validateOpenUIForAgent(animated.replace("at:28", "at:27")).errors.join(" "), /scope bounds/);
});

test("validation accepts composed grids and timelines but rejects invalid milestone colors", () => {
  const source = 'root = Stack([Grid(2, [TextContent("The voyage"), TextContent("The return")]), Timeline("Journey", [Milestone("Troy", "Departure", "01", "#75BDD0"), Milestone("Ithaca", "Homecoming")])])';
  assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] });
  assert.equal(validateOpenUIForAgent(source.replace('"#75BDD0"', '"blue"')).valid, false);
});

test("validation accepts local choices and hotspots but rejects ambiguous IDs", () => {
  const source = 'root = Stack([ChoiceGroup("Compare", [ChoiceOption("one", "One", [HotspotVisual("Inspect", Scene("A", "#101010", [{id:"dot",kind:"circle",x:100,y:100,width:20,fill:"#FFFFFF"}]), [Hotspot("dot", "Dot", "A white dot", 100, 100)])]), ChoiceOption("two", "Two", [TextContent("Another view")])])])';
  assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] });
  assert.match(validateOpenUIForAgent(source.replace('ChoiceOption("two"', 'ChoiceOption("one"')).errors.join(" "), /unique/);
  assert.equal(validateOpenUIForAgent(source.replace('"A white dot", 100, 100', '"A white dot", 5, 100')).valid, false);
});

test("validation accepts curated scene colors and rejects arbitrary hex", () => {
  const source = 'root = Stack([HotspotVisual("Inspect", PaletteScene("Coast", "blue", [{id:"sun",kind:"circle",x:400,y:120,width:80,fill:"accent"}]), [Hotspot("sun", "Sun", "The sun", 400, 120)])])';
  assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] });
  assert.equal(validateOpenUIForAgent(source.replace('fill:"accent"', 'fill:"#FFFF00"')).valid, false);
});

test("validation rejects flow diagrams and Mermaid programs", () => {
  const source = 'root = Stack([FlowDiagram("A decision", [{id:"start",label:"Start",accent:"primary"},{id:"end",label:"Finish",accent:"accent"}], [{from:"start",to:"end"}], "green")])';
  assert.equal(validateOpenUIForAgent(source).valid, false);
  assert.equal(validateOpenUIForAgent('root = Stack([Mermaid("flowchart LR\\nA-->B")])').valid, false);
});

test("local state controls can switch composed scenes without host actions", () => {
  const source = `root = Stack([
    LocalButton("Day", @Set($mode, "day")),
    LocalButton("Night", @Set($mode, "night")),
    LocalView($mode == "day", [PaletteScene("Day", "blue", [{id:"sun",kind:"circle",x:500,y:180,width:100,fill:"accent"}]), TextContent("Sunlit")]),
    LocalView($mode == "night", [PaletteScene("Night", "blue", [{id:"moon",kind:"circle",x:500,y:180,width:100,fill:"surface"}]), TextContent("Moonlit")])
  ])
  $mode = "day"`;
  assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] });
  assert.equal(validateOpenUIForAgent(source.replace('@Set($mode, "night")', '@OpenUrl("https://example.com")')).valid, false);
  assert.equal(validateOpenUIForAgent(source.replace('@Set($mode, "night")', '@ToAssistant("hello")')).valid, false);
  assert.equal(validateOpenUIForAgent(source.replace('@Set($mode, "night")', '@Set($missing, "night")')).valid, false);
  assert.equal(validateOpenUIForAgent(source.replace('@Set($mode, "night")', '@Set($mode, $mode + "x")')).valid, false);
});

test("a local range must bind to a declared bounded number", () => {
  const source = 'root = Stack([LocalRange($step, 0, 10, 1, "Step"), LocalView($step < 5, [TextContent("Early")]), LocalView($step >= 5, [TextContent("Late")])])\n$step = 2';
  assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] });
  assert.equal(validateOpenUIForAgent(source.replace('$step < 5', '$step < 5 ? true : false')).valid, true);
  assert.equal(validateOpenUIForAgent(source.replace('0, 10', '0, 1000')).valid, false);
  assert.equal(validateOpenUIForAgent(source.replace('$step = 2', '$step = "two"')).valid, false);
});

test("standard OpenUI controls and approved data tools are accepted", () => {
  const programs = [
    'root = Stack([Button("Ask", @ToAssistant("Explain more"))])',
    'root = Stack([Button("Ask", @ToAssistant("Explain more", {topic:"rules"}))])',
    'root = Stack([Button("Source", @OpenUrl("https://example.com/guide"))])',
    'root = Stack([Button("Reset", @Reset($mode))])\n$mode = "first"',
    'root = Stack([Button("Copy", @Run(copy))])\ncopy = Mutation("visual_copy_text", {text:"Example"})',
    'root = Stack([TextContent(now.iso)])\nnow = Query("visual_current_time", {}, {iso:""})',
    'root = Stack([TextContent(clip.text)])\nclip = Query("visual_read_clipboard_text", {}, {ok:false,text:""})',
    'root = Stack([TextContent(file.name)])\nfile = Query("visual_pick_text_file", {}, {ok:false,name:"",text:""})',
    'root = Stack([Button("Export", @Run(save))])\nsave = Mutation("visual_save_text", {name:"notes.txt",text:"Example"})',
    'root = Stack([Image("Example", "data:image/png;base64,aGVsbG8=")])',
  ];
  for (const source of programs) assert.deepEqual(validateOpenUIForAgent(source), { valid: true, errors: [] }, source);
});

test("OpenUI data and host capabilities stay allowlisted", () => {
  const blocked = [
    'root = Stack([Button("Bad", @OpenUrl("javascript:alert(1)"))])',
    'root = Stack([Button("Bad", @OpenUrl("http://example.com"))])',
    'root = Stack([Button("Bad", @OpenUrl("https://name:secret@example.com"))])',
    'root = Stack([Button("Bad", @Custom("run_shell"))])',
    'root = Stack([TextContent(q.value)])\nq = Query("shell", {}, {value:""})',
    'root = Stack([Button("Bad", @Run(m))])\nm = Mutation("delete_file", {})',
    'root = Stack([Image("Bad", "file:///etc/passwd")])',
    'root = Stack([Image("Bad", "https://example.com/image.png")])',
    'root = Stack([Button("Bad", @Set($missing, 1))])',
  ];
  for (const source of blocked) assert.equal(validateOpenUIForAgent(source).valid, false, source);
});
