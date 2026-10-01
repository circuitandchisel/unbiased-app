import { join } from "node:path";

export function agentBrowserCandidates(resourcesPath: string, packaged: boolean, home: string, pathEnv: string): string[] {
  return [
    ...(packaged ? [join(resourcesPath, "browser", "agent-browser")] : []),
    ...pathEnv.split(":").filter(Boolean).map((dir) => join(dir, "agent-browser")),
    "/opt/homebrew/bin/agent-browser",
    "/usr/local/bin/agent-browser",
    join(home, ".local", "bin", "agent-browser"),
    join(home, ".npm-global", "bin", "agent-browser"),
    join(home, ".cargo", "bin", "agent-browser"),
  ];
}

export function chromeCandidates(resourcesPath: string, packaged: boolean, darwinMajor: number): string[] {
  return [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ...(packaged && darwinMajor >= 22
      ? [join(resourcesPath, "browser", "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing")]
      : []),
  ];
}
