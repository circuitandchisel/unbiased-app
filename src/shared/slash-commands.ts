export type SlashCommand = {
  id: string;
  command: string;
  label: string;
  description: string;
  source: string;
  skill?: { name: string; path: string };
};

export const PLAN_COMMAND: SlashCommand = { id: "plan", command: "Plan", label: "Plan", description: "Research first, propose a plan, then act", source: "Unbiased" };

/** Ignore quoted examples and code; preserve offsets into the original draft. */
export function commandTokens(text: string): { name: string; rest: string }[] {
  const prose = text.replace(/```[\s\S]*?(?:```|(?![\s\S]))|~~~[\s\S]*?(?:~~~|(?![\s\S]))|`[^`\n]*`|^[ \t]*>[^\n]*/gm, value => value.replace(/[^\n]/g, " "));
  const matches = prose.matchAll(/(?:^|[\s(])\/(code[ \t]+review|[\p{L}\p{N}_-]+)(?=$|[\s),.!?:;])/giu);
  return [...matches].map(match => ({
    name: /^code[ \t]+review$/i.test(match[1]) ? "CodeReview" : match[1],
    rest: text.slice(match.index! + match[0].length).trimStart(),
  }));
}

export function commandToken(text: string): { name: string; rest: string } | null {
  return commandTokens(text)[0] ?? null;
}

/** Text-block offsets; the rich composer translates these to editor positions. */
export type SlashQuery = { query: string; from: number; to: number };
export function slashQueryAt(text: string, caret: number): SlashQuery | null {
  const before = text.slice(0, caret);
  const match = /(?:^|[\s(])\/([^/\r\n]*)$/.exec(before);
  if (!match) return null;
  const from = match.index + match[0].indexOf("/");
  let to = caret + (/^[\p{L}\p{N}_-]*/u.exec(text.slice(caret))?.[0].length ?? 0);
  const alias = /^\/code[ \t]+review(?=$|[\s),.!?:;])/i.exec(text.slice(from));
  if (alias && from + alias[0].length >= caret) to = from + alias[0].length;
  return { query: match[1], from, to };
}

/** Bundled skills are the default; an explicit source selection still wins. */
export function preferredCommand<T extends { source: string }>(commands: readonly T[]): T | undefined {
  const unbiased = commands.filter(command => command.source === "Unbiased");
  return unbiased.length === 1 ? unbiased[0] : commands.length === 1 ? commands[0] : undefined;
}

export function compareSlashCommands(a: SlashCommand, b: SlashCommand): number {
  return commandKey(a.command).localeCompare(commandKey(b.command))
    || Number(b.source === "Unbiased") - Number(a.source === "Unbiased")
    || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}

export function commandKey(name: string): string {
  return name.replace(/[\s_-]/g, "").toLowerCase();
}

export function commandMatches(command: SlashCommand, query: string): boolean {
  return commandKey(command.command).startsWith(commandKey(query)) || commandKey(command.label).startsWith(commandKey(query));
}
