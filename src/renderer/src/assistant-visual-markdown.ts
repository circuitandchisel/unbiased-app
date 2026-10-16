import remarkParse from "remark-parse";
import { unified } from "unified";
import { validateOpenUIForAgent } from "../../shared/visual-validation";

const BARE_OPENUI = /^\s*root\s*=\s*Stack\s*\(/;
const OPENUI_PREFIX = "root=Stack(";
const VISUAL_FALLBACK = "The visual couldn't be displayed. The rest of the answer is still available.";
const markdownParser = unified().use(remarkParse);
const completedCache = new Map<string, string>();

function finalizedVisualMarkdown(text: string): string {
  const cached = completedCache.get(text);
  if (cached !== undefined) return cached;
  let result = text;
  if (BARE_OPENUI.test(text)) {
    result = validateOpenUIForAgent(text).valid ? `\`\`\`\`openui\n${text}\n\`\`\`\`` : VISUAL_FALLBACK;
  } else {
    // A fence generated adjacent to prose is normalized before parsing, so
    // the gate sees the same visual block that Markdown will render.
    const normalized = text.replace(/([^\r\n`])(?=\`{3,}(?:openui|mermaid|visual-html)[ \t]*\r?\n)/gi, "$1\n");
    result = normalized;
    const nodes = markdownParser.parse(normalized).children;
    const replacements = nodes.flatMap((node) => {
      if (node.type !== "code" || node.position?.start.offset === undefined || node.position.end.offset === undefined) return [];
      const language = node.lang?.toLowerCase();
      if (language !== "mermaid" && (language !== "openui" || validateOpenUIForAgent(node.value).valid)) return [];
      return [{ start: node.position.start.offset, end: node.position.end.offset }];
    });
    for (const { start, end } of replacements.reverse()) {
      result = `${result.slice(0, start)}${VISUAL_FALLBACK}${result.slice(end)}`;
    }
  }
  if (completedCache.size >= 16) completedCache.delete(completedCache.keys().next().value!);
  completedCache.set(text, result);
  return result;
}

export function assistantVisualMarkdown(text: string, streaming: boolean): string {
  if (!streaming) return finalizedVisualMarkdown(text);
  const compact = text.replace(/\s/g, "");
  if (BARE_OPENUI.test(text) || (streaming && compact.length > 0 && OPENUI_PREFIX.startsWith(compact))) {
    return `\`\`\`\`openui\n${text}\n\`\`\`\``;
  }
  // A missing newline before a generated visual fence makes Markdown print its source.
  return text.replace(/([^\r\n`])(?=\`{3,}(?:openui|mermaid|visual-html)[ \t]*\r?\n)/gi, "$1\n");
}

export function visualOutputType(text: string): string {
  const displayed = assistantVisualMarkdown(text, false);
  const visual = /```(openui|visual-html)\b/i.exec(displayed);
  if (visual) return visual[1].toLowerCase();
  if (/^\|[^\n]+\|\s*\n\|\s*:?-{3,}/m.test(displayed)) return "table";
  return "text";
}
