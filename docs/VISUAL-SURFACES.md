# Visual surfaces

Assistant Markdown can contain a fenced `a2ui` JSON array. The chat renderer
looks up that language in its bundled visual-surface registry and renders a
validated A2UI v0.9 surface. The original assistant text is still saved by the
existing transcript path, so the surface is reconstructed after reopening a
conversation. Incomplete, malformed, or unsupported fences remain code blocks.

The first bundled plugin is in `src/renderer/src/visual-surface-plugins.tsx`.
It uses `@a2ui/react` with the app-owned catalog
`https://unbiased.ai/a2ui/visual-v1`. The catalog registers the 18 basic A2UI
components plus the app's BarChart and Konva-backed Whiteboard. The model is currently guided toward the
safe text, layout, form, and chart components. Remote media and action-bearing
controls are registered but cannot be used until the app has explicit media
and action handling. Adding a renderer means adding a registry entry and a
parser; it does not require changing conversation persistence. AG-UI, if
adopted later, can carry the same A2UI messages through a transport adapter.

Only one surface and at most 40 components are accepted per block. The parser
rejects actions, function calls, remote URLs, unknown components, and oversized
payloads. There is no model-to-Electron IPC path from these surfaces. An
external plugin loader is deliberately **not** part of this first version:
renderer implementations are bundled and reviewed with the app.
For compatibility with model-generated replies, a Text component's `value`
is normalized to the catalog's `text` property when `text` is absent.
Slider changes update only the bound data path. Separate chart values are not
automatically derived from that path.

Whiteboard accepts up to 60 bounded shapes: circle, oval, square, rectangle,
triangle, line, and arrow. Each shape has a unique ID, type, x/y, width,
optional height, fill/stroke hex colors, and optional label. Coordinates use an
800x450 board and scale to the chat width. Users can add, select, drag,
recolor, delete, and export shapes as PNG. Edits are local to the mounted
view; the saved transcript retains the agent's original shape data.

Example:

````markdown
```a2ui
[
  {"version":"v0.9","createSurface":{"surfaceId":"visual","catalogId":"https://unbiased.ai/a2ui/visual-v1"}},
  {"version":"v0.9","updateComponents":{"surfaceId":"visual","components":[
    {"id":"root","component":"Column","children":["slider","chart"]},
    {"id":"slider","component":"Slider","label":"Amount","value":{"path":"/amount"},"min":0,"max":100},
    {"id":"chart","component":"BarChart","title":"Result","bars":[{"label":"Capacity","value":100},{"label":"Selected","value":{"path":"/amount"}}]}
  ]}},
  {"version":"v0.9","updateDataModel":{"surfaceId":"visual","path":"/","value":{"amount":50}}}
]
```
````
