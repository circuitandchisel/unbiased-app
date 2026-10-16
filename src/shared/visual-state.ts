type VisualElement = { type: "element"; typeName: string; props: Record<string, unknown> };

function element(value: unknown, typeName: string): value is VisualElement {
  return !!value && typeof value === "object" &&
    (value as VisualElement).type === "element" && (value as VisualElement).typeName === typeName;
}

export function stateScopeIssue(props: Record<string, unknown>): string | null {
  const { min, max, children } = props;
  if (!Number.isInteger(min) || !Number.isInteger(max) || !Array.isArray(children)) return "StateScope needs a numeric range and children.";
  const sliders = children.filter((child) => element(child, "Slider"));
  const views = children.filter((child) => element(child, "StateView"));
  if (sliders.length !== 1 || views.length === 0) return "StateScope needs exactly one Slider and at least one StateView.";
  for (const scene of children.filter((child) => element(child, "StateScene"))) {
    const frames = scene.props.keyframes;
    if (!Array.isArray(frames) || frames[0]?.at !== min || frames[frames.length - 1]?.at !== max) {
      return "StateScene keyframes must start and end at the scope bounds.";
    }
  }
  for (const view of views) {
    const cases = view.props.cases;
    if (!Array.isArray(cases) || !cases.length || !cases.every((item) => element(item, "StateCase"))) {
      return "StateView needs StateCase entries.";
    }
    const intervals = cases.map((item) => ({ from: item.props.from as number, to: item.props.to as number }))
      .sort((left, right) => left.from - right.from);
    let next = min as number;
    for (const { from, to } of intervals) {
      if (!Number.isInteger(from) || !Number.isInteger(to) || from !== next || to < from) {
        return "StateCase ranges must cover the scope without gaps or overlaps.";
      }
      next = to + 1;
    }
    if (next !== (max as number) + 1) return "StateCase ranges must cover the scope without gaps or overlaps.";
  }
  return null;
}
