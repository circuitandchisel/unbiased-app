import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { APP_MODEL } from "./model-routing";

test("the actual release gate accepts the app model and rejects stale or incomplete engine bundles", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
  const match = workflow.match(/      - name: verify the (?:preview )?Pareto engine shipped\n        working-directory: unbiased-app\n        run: \|\n([\s\S]*?)(?=\n      - name:)/);
  assert.ok(match, "release engine verification step exists");
  const script = match[1].replace(/^ {10}/gm, "");
  const root = mkdtempSync(join(tmpdir(), "unbiased-release-engine-check-"));
  const bin = join(root, "release/mac-arm64/Unbiased.app/Contents/Resources/engine/unbiased-app-engine");
  mkdirSync(dirname(bin), { recursive: true });
  const check = () => execFileSync("bash", ["-e", "-o", "pipefail", "-c", script], { cwd: root, stdio: "pipe" });
  try {
    writeFileSync(bin, `model = "${APP_MODEL}"\nmodel_context_window = 1048576\n`, { mode: 0o755 });
    assert.doesNotThrow(check, "the release gate must accept the same model selected by the app");
    writeFileSync(bin, 'model = "pareto-26.10-preview"\nmodel_context_window = 1048576\n');
    assert.throws(check, "a bundle configured for the retired preview must fail");
    writeFileSync(bin, `model = "${APP_MODEL}"\n`);
    assert.throws(check, "the declared context window remains required");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
