import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { locked, noSymlinks } from "./atomic-store";
import type { IpcMain } from "electron";
import { AGENT_INSTRUCTIONS_MAX_BYTES, type AgentInstructions, type AgentInstructionsSaveResult } from "../shared/agent-instructions";
import { defaultAgentInstructions } from "../shared/default-agent-instructions";

export function agentInstructionsPath(home: string): string {
  return join(home, ".unbiased", "AGENTS.md");
}

export function registerAgentInstructionsIpc(ipc: Pick<IpcMain, "handle">, home: string): void {
  ipc.handle("agent-instructions:get", () => readAgentInstructions(home));
  ipc.handle("agent-instructions:set", (_event, value: unknown) => saveAgentInstructions(home, value));
}

export function readAgentInstructions(home: string): AgentInstructions {
  const path = agentInstructionsPath(home);
  noSymlinks(path);
  try {
    if (statSync(path).size > AGENT_INSTRUCTIONS_MAX_BYTES) throw new Error("Custom agent instructions must be 64 KB or smaller.");
    const content = readFileSync(path, "utf8");
    return { path, content, revision: createHash("sha256").update(content).digest("hex") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, content: "", revision: null };
    throw error;
  }
}

export function saveAgentInstructions(home: string, value: unknown): AgentInstructionsSaveResult {
  try {
    const p = value as { content?: unknown; expectedRevision?: unknown } | null;
    if (!p || typeof p.content !== "string" || !(p.expectedRevision === null || typeof p.expectedRevision === "string")) {
      throw new Error("Invalid custom instructions request.");
    }
    const content = p.content;
    if (Buffer.byteLength(content, "utf8") > AGENT_INSTRUCTIONS_MAX_BYTES) throw new Error("Custom agent instructions must be 64 KB or smaller.");
    const file = agentInstructionsPath(home);
    return locked(file, () => {
      if (readAgentInstructions(home).revision !== p.expectedRevision) {
        return { ok: false, conflict: true, error: "Instructions changed outside this editor. Reload them before saving." };
      }
      const temp = `${file}.${randomUUID()}.tmp`;
      try {
        const fd = openSync(temp, "wx", 0o600);
        try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
        renameSync(temp, file);
      } finally { rmSync(temp, { force: true }); }
      return { ok: true, document: readAgentInstructions(home) };
    });
  } catch (error) {
    return { ok: false, conflict: false, error: error instanceof Error ? error.message : "Could not save custom instructions." };
  }
}

function entry(path: string) {
  try { return lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** The engine refreshes CODEX_HOME/AGENTS.md each turn. Keep one editable source. */
export function connectAgentInstructions(home: string, engineHome: string): void {
  const canonical = agentInstructionsPath(home);
  const codexRelative = relative(join(home, ".codex"), resolve(engineHome));
  if (codexRelative === "" || (!isAbsolute(codexRelative) && codexRelative.split(/[\\/]/)[0] !== "..")) {
    throw new Error("Unbiased custom instructions cannot be connected inside ~/.codex.");
  }
  const target = join(engineHome, "AGENTS.md");
  noSymlinks(canonical);
  noSymlinks(engineHome);
  if (resolve(canonical) === resolve(target)) return;
  const pointsToCanonical = (path: string) => entry(path)?.isSymbolicLink() && resolve(dirname(path), readlinkSync(path)) === resolve(canonical);
  const override = join(engineHome, "AGENTS.override.md");
  if (entry(override) && !pointsToCanonical(override)) {
    throw new Error(`Move the instructions in ${override} to ${canonical} and remove the override so Personalization can apply.`);
  }
  if (pointsToCanonical(target)) return;
  const old = entry(target);
  if (old) {
    // Preserve old private-home instructions, but never read/import Codex's home.
    if (!old.isFile()) throw new Error(`Cannot connect custom instructions: ${target} is not a regular file or an Unbiased instructions link.`);
    if (entry(canonical)) {
      throw new Error(`Custom instructions exist at both ${target} and ${canonical}. Combine them in ${canonical} and remove the private-home file.`);
    }
    mkdirSync(dirname(canonical), { recursive: true, mode: 0o700 });
    // Create without replacing a canonical file that another writer just made.
    linkSync(target, canonical);
    rmSync(target);
  }
  mkdirSync(engineHome, { recursive: true, mode: 0o700 });
  symlinkSync(canonical, target);
}

export function agentInstructionsGuidance(home: string): string {
  return `Unbiased global custom agent instructions are stored at ${agentInstructionsPath(home)}. ` +
    "When the user explicitly asks to save or change instructions for all Unbiased chats, edit that exact file, preserve unrelated instructions, and verify the result. " +
    "Do not use ~/.codex/AGENTS.md or another product's instruction files for Unbiased preferences. " +
    "These global instructions reload at the next turn in existing and new chats. Project AGENTS.md instructions also apply. " +
    "Honor instructions requiring explicit user consent, such as before merging a PR; tool access alone is not that consent. " +
    "Saving a project memory note alone does not update global instructions.";
}

export function builtInAgentInstructions(home: string): string {
  return `${defaultAgentInstructions()}\n\n${agentInstructionsGuidance(home)}`;
}
