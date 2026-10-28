import { isAbsolute, relative } from "node:path";
import { commandKey, commandToken, PLAN_COMMAND, type SlashCommand } from "../shared/slash-commands";

type Request = (method: string, params: Record<string, unknown>) => Promise<unknown>;
type AvailableCommand = SlashCommand & { enabled: boolean; skill: { name: string; path: string } };
type SkillInput = { type: "skill"; name: string; path: string };

async function skillCommands(request: Request, cwd: string | null, bundledRoot: string): Promise<AvailableCommand[]> {
  const result = await request("skills/list", { cwds: cwd ? [cwd] : [], forceReload: true }) as { data?: { skills?: unknown[] }[] };
  if (!Array.isArray(result?.data)) throw new Error("Could not load available skill commands.");
  const commands = new Map<string, AvailableCommand>();
  for (const group of result.data) for (const raw of Array.isArray(group.skills) ? group.skills : []) {
    if (!raw || typeof raw !== "object") continue;
    const skill = raw as Record<string, unknown>;
    if (typeof skill.name !== "string" || typeof skill.path !== "string" || typeof skill.enabled !== "boolean") continue;
    const skillCommand = skill.name.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join("");
    if (!skillCommand) continue;
    const command = commandKey(skillCommand) === commandKey(PLAN_COMMAND.command) ? `Skill${skillCommand}` : skillCommand;
    const ui = skill.interface && typeof skill.interface === "object" ? skill.interface as Record<string, unknown> : {};
    const label = typeof ui.displayName === "string" && ui.displayName.trim() ? ui.displayName : skill.name.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const rel = relative(bundledRoot, skill.path);
    const bundled = rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel);
    const description = [skill.shortDescription, ui.shortDescription, skill.description].find(value => typeof value === "string" && value.trim()) as string | undefined;
    commands.set(skill.path, { id: `skill:${skill.path}`, command, label, description: description ?? "Use this skill", source: bundled ? "Unbiased" : skill.scope === "repo" ? "This project" : "Shared", enabled: skill.enabled, skill: { name: skill.name, path: skill.path } });
  }
  return [...commands.values()].sort((a, b) => a.label.localeCompare(b.label) || a.skill.path.localeCompare(b.skill.path));
}

export async function listSlashCommands(request: Request, cwd: string | null, bundledRoot: string): Promise<SlashCommand[]> {
  return [PLAN_COMMAND, ...(await skillCommands(request, cwd, bundledRoot)).filter(command => command.enabled)];
}

/** Resolve against the current pane's live skill list, never an arbitrary renderer path. */
export async function resolveSlashSkill(request: Request, cwd: string | null, bundledRoot: string, text: string, selectedPath?: string): Promise<SkillInput | null> {
  const token = commandToken(text);
  if (!token) {
    if (selectedPath) throw new Error("The selected skill no longer matches this message.");
    return null;
  }
  const commands = await skillCommands(request, cwd, bundledRoot);
  const matches = commands.filter(command => commandKey(command.command) === commandKey(token.name));
  const enabled = matches.filter(command => command.enabled);
  const selected = selectedPath ? enabled.find(command => command.skill.path === selectedPath) : enabled.length === 1 ? enabled[0] : undefined;
  if (selected) return { type: "skill", ...selected.skill };
  if (enabled.length > 1) throw new Error("More than one skill has this command. Choose its source in the command menu.");
  if (selectedPath || matches.length || commandKey(token.name) === "codereview") throw new Error("This skill is disabled or unavailable in this chat. Choose an available command.");
  return null;
}
