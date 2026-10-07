import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

type EnginePathOptions = {
  override?: string;
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
};

export function resolveEngineDir({ override, isPackaged, resourcesPath, appPath }: EnginePathOptions): string {
  if (override) return override;
  if (isPackaged) return join(resourcesPath, "engine");

  const sibling = join(appPath, "..", "unbiased-app-engine", "dist", "bundle");
  if (existsSync(join(sibling, "unbiased-app-engine"))) return sibling;

  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: appPath,
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const gitDir = isAbsolute(common) ? common : resolve(appPath, common);
    const worktreeSibling = join(dirname(dirname(gitDir)), "unbiased-app-engine", "dist", "bundle");
    if (existsSync(join(worktreeSibling, "unbiased-app-engine"))) return worktreeSibling;
  } catch {
    // A source checkout without Git still gets the ordinary sibling path.
  }
  return sibling;
}
