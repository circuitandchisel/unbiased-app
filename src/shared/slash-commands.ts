export type SlashCommand = {
  id: string;
  command: string;
  label: string;
  description: string;
  source: string;
  skill?: { name: string; path: string };
};

export const PLAN_COMMAND: SlashCommand = { id: "plan", command: "Plan", label: "Plan", description: "Research first, propose a plan, then act", source: "Unbiased" };

export function commandToken(text: string): { name: string; rest: string } | null {
  const review = /^\/code[ \t]+review(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (review) return { name: "CodeReview", rest: review[1] ?? "" };
  const match = /^\/([\p{L}\p{N}_-]+)(?:\s+([\s\S]*))?$/u.exec(text.trim());
  return match ? { name: match[1], rest: match[2] ?? "" } : null;
}

export function commandKey(name: string): string {
  return name.replace(/[\s_-]/g, "").toLowerCase();
}

export function commandMatches(command: SlashCommand, query: string): boolean {
  return commandKey(command.command).startsWith(commandKey(query)) || commandKey(command.label).startsWith(commandKey(query));
}
