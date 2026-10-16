export type ApprovedVisual = { format: "openui" | "visual-html"; source: string };

export function appendApprovedVisual(text: string, visual: ApprovedVisual): string {
  if (text.includes(visual.source) && /^\s*`{3,}(?:openui|visual-html)\s*$/im.test(text)) return text;
  if (text.includes(visual.source)) text = text.replace(visual.source, "").trimEnd();
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const opening = /^\s*(`{3,})(openui|visual-html)\s*$/i.exec(lines[i]);
    if (!opening) {
      kept.push(lines[i]);
      continue;
    }
    const closing = new RegExp(`^\\s*\x60{${opening[1].length},}\\s*$`);
    const end = lines.findIndex((line, index) => index > i && closing.test(line));
    if (end < 0) {
      kept.push(lines[i]);
      continue;
    }
    i = end;
  }
  text = kept.join("\n").trimEnd();
  const longest = Math.max(3, ...Array.from(visual.source.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${fence}${visual.format}\n${visual.source}\n${fence}`;
}
