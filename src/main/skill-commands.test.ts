import test from "node:test";
import assert from "node:assert/strict";
import { listSlashCommands, resolveSlashSkill } from "./skill-commands";
import { commandMatches, commandToken } from "../shared/slash-commands";

const bundled = { name: "code-review", path: "/app/skills/code-review/SKILL.md", enabled: true, scope: "user", description: "Review standards and spec", interface: { displayName: "Code Review", shortDescription: "Review a diff" } };
const project = { name: "project-check", path: "/project/.codex/skills/project-check/SKILL.md", enabled: true, scope: "repo" };
const disabled = { name: "disabled-skill", path: "/app/skills/disabled-skill/SKILL.md", enabled: false };
const request = async () => ({ data: [{ skills: [bundled, project, disabled] }] });

test("picker shows enabled commands with real labels and source scopes, filtered case-insensitively", async () => {
  const calls: unknown[] = [];
  const commands = await listSlashCommands(async (method, params) => { calls.push([method, params]); return request(); }, "/project", "/app/skills");
  assert.deepEqual(calls, [["skills/list", { cwds: ["/project"], forceReload: true }]]);
  assert.deepEqual(commands.map(command => command.command), ["Plan", "CodeReview", "ProjectCheck"]);
  assert.equal(commands[1].label, "Code Review");
  assert.equal(commands[1].description, "Review a diff");
  assert.equal(commands[1].source, "Unbiased");
  assert.equal(commands[2].source, "This project");
  assert.deepEqual(commands.filter(command => commandMatches(command, "cOd")).map(command => command.command), ["CodeReview"]);
  assert.equal(commandToken("/CodeReview origin/main\nSpec: docs/spec.md")?.rest, "origin/main\nSpec: docs/spec.md");
  assert.equal(commandToken("/path/to/file"), null);
});

test("sending a command attaches the exact live engine skill, not model-guessed prose", async () => {
  assert.deepEqual(await resolveSlashSkill(request, "/project", "/app/skills", "/code-review origin/main"), { type: "skill", name: "code-review", path: bundled.path });
  assert.equal(await resolveSlashSkill(async () => { throw new Error("must not query"); }, null, "/app/skills", "ordinary message"), null);
  await assert.rejects(resolveSlashSkill(request, "/project", "/app/skills", "/DisabledSkill"), /disabled or unavailable/);
  await assert.rejects(resolveSlashSkill(request, "/project", "/app/skills", "/CodeReview", "/unlisted/SKILL.md"), /disabled or unavailable/);
  await assert.rejects(resolveSlashSkill(async () => ({ data: [{ skills: [] }] }), "/project", "/app/skills", "/CodeReview"), /disabled or unavailable/);
});

test("the spaced Code Review alias resolves the same skill and preserves arguments", async () => {
  assert.deepEqual(commandToken("/cOdE Review origin/main\nSpec: docs/review.md"), { name: "CodeReview", rest: "origin/main\nSpec: docs/review.md" });
  assert.deepEqual(await resolveSlashSkill(request, "/project", "/app/skills", "/Code Review origin/main", bundled.path), await resolveSlashSkill(request, "/project", "/app/skills", "/CodeReview origin/main", bundled.path));
  assert.equal(commandToken("/Code Review/path")?.name, "Code");
  assert.notEqual(commandToken("/Code Reviewer")?.name, "CodeReview");
});

test("Unbiased is the default for duplicate names; explicit choices are still revalidated", async () => {
  const local = { ...bundled, path: "/project/.codex/skills/code-review/SKILL.md", scope: "repo" };
  const duplicates = async () => ({ data: [{ skills: [local, bundled] }] });
  assert.equal((await resolveSlashSkill(duplicates, "/project", "/app/skills", "Please /CodeReview this PR"))?.path, bundled.path);
  const listed = await listSlashCommands(duplicates, "/project", "/app/skills");
  assert.deepEqual(listed.filter(command => command.command === "CodeReview").map(command => command.source), ["Unbiased", "This project"]);
  const shared = { ...local, path: "/shared/code-review/SKILL.md", scope: "user" };
  await assert.rejects(resolveSlashSkill(async () => ({ data: [{ skills: [shared, local] }] }), "/project", "/app/skills", "/CodeReview"), /More than one/);
  assert.equal((await resolveSlashSkill(async () => ({ data: [{ skills: [{ ...bundled, enabled: false }, local] }] }), "/project", "/app/skills", "/CodeReview"))?.path, local.path);
  assert.deepEqual(await resolveSlashSkill(duplicates, "/project", "/app/skills", "/CodeReview", local.path), { type: "skill", name: "code-review", path: local.path });
  await assert.rejects(resolveSlashSkill(request, "/another-project", "/app/skills", "/CodeReview", local.path), /unavailable/);
  await assert.rejects(listSlashCommands(async () => ({}), null, "/app/skills"), /Could not load/);
});

test("a skill called plan cannot take over the built-in Plan command", async () => {
  const planSkill = { ...bundled, name: "plan", path: "/app/skills/plan/SKILL.md" };
  const get = async () => ({ data: [{ skills: [planSkill] }] });
  assert.deepEqual((await listSlashCommands(get, null, "/app/skills")).map(command => command.command), ["Plan", "SkillPlan"]);
  assert.equal(await resolveSlashSkill(get, null, "/app/skills", "/Plan"), null);
  assert.equal((await resolveSlashSkill(get, null, "/app/skills", "/SkillPlan"))?.path, planSkill.path);
});

for (const checkout of ["new-worktree", "existing-worktree"]) test(`first send preserves a project skill selection in a ${checkout}`, async () => {
  const cwd = `/worktrees/${checkout}`;
  const destination = { ...project, path: `${cwd}/.codex/skills/project-check/SKILL.md` };
  const get = async () => ({ data: [{ skills: [destination] }] });
  const selection = (await listSlashCommands(request, "/project", "/app/skills")).find(command => command.command === "ProjectCheck")!.skill!.path;
  assert.deepEqual(await resolveSlashSkill(get, cwd, "/app/skills", "/ProjectCheck", selection, "/project"), { type: "skill", name: project.name, path: destination.path });
  await assert.rejects(resolveSlashSkill(get, cwd, "/app/skills", "/ProjectCheck", selection), /unavailable/);
  await assert.rejects(resolveSlashSkill(get, cwd, "/app/skills", "/ProjectCheck", "/other/.codex/skills/project-check/SKILL.md", "/project"), /unavailable/);
  for (const skills of [[], [{ ...destination, enabled: false }], [{ ...destination, scope: "user" }]]) {
    await assert.rejects(resolveSlashSkill(async () => ({ data: [{ skills }] }), cwd, "/app/skills", "/ProjectCheck", selection, "/project"), /unavailable/);
  }
});

test("inline commands resolve after ordinary slash text and ignore code examples", async () => {
  assert.equal((await resolveSlashSkill(request, "/project", "/app/skills", "Compare /unknown and then /CodeReview this PR"))?.path, bundled.path);
  for (const text of ["See https://example.com/CodeReview", "Read /CodeReview/file", "Use `/CodeReview` as an example", "> /CodeReview", "```\n/CodeReview\n``` "]) {
    assert.equal(commandToken(text), null, text);
  }
});
