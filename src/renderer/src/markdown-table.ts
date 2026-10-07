/** Preserve a rendered GFM table as pasteable Markdown. */
export function tableToMarkdown(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return "";
  const columnCount = Math.max(...rows.map((row) => row.length));
  const cell = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
  const line = (row: readonly string[]) => `| ${Array.from({ length: columnCount }, (_, index) => cell(row[index])).join(" | ")} |`;
  return [line(rows[0]), line(Array(columnCount).fill("---")), ...rows.slice(1).map(line)].join("\n");
}
