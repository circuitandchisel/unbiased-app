import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveEngineDir } from "./engine-path";

test("dev engine path follows the primary checkout from a Git worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "unbiased-engine-path-"));
  try {
    const appPath = join(root, "unbiased-app");
    const worktreePath = join(root, "worktree", "unbiased-app");
    const bundle = join(root, "unbiased-app-engine", "dist", "bundle");
    mkdirSync(appPath);
    mkdirSync(bundle, { recursive: true });
    writeFileSync(join(bundle, "unbiased-app-engine"), "test");
    execFileSync("git", ["init", "-q", appPath]);
    execFileSync("git", ["-C", appPath, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "--allow-empty", "-m", "init"]);
    execFileSync("git", ["-C", appPath, "worktree", "add", "-q", "--detach", worktreePath]);

    assert.equal(realpathSync(resolveEngineDir({ isPackaged: false, resourcesPath: root, appPath: worktreePath })), realpathSync(bundle));
    assert.equal(resolveEngineDir({ override: "/custom/engine", isPackaged: false, resourcesPath: root, appPath: worktreePath }), "/custom/engine");
    assert.equal(resolveEngineDir({ isPackaged: true, resourcesPath: root, appPath: worktreePath }), join(root, "engine"));
    assert.equal(existsSync(join(worktreePath, "unbiased-app-engine")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
