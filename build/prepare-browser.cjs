// Stage the pinned agent-browser CLI for electron-builder's extraResources.
const { execFileSync } = require("node:child_process");
const { copyFileSync, existsSync, mkdirSync, rmSync, renameSync, chmodSync } = require("node:fs");
const { join } = require("node:path");

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("The browser bundle currently supports only macOS arm64");
}

const root = join(__dirname, "..");
const cache = join(root, "build", ".browser-cache");
const bundle = join(root, "build", "browser-bundle");
const artifacts = [
  {
    file: "agent-browser-darwin-arm64-v0.38.1",
    url: "https://github.com/vercel-labs/agent-browser/releases/download/v0.38.1/agent-browser-darwin-arm64",
    sha256: "2e61287259053ea964d39e77002c6a34af0e589e55ccff25e659efae7e892e0d",
  },
  {
    file: "agent-browser-LICENSE-v0.38.1",
    url: "https://raw.githubusercontent.com/vercel-labs/agent-browser/v0.38.1/LICENSE",
    sha256: "014bb31e83d5c2e76aea1cc6e82217346ab41362f32cb355ad0f5c10aa0aeaff",
  },
];

function checksum(path) {
  return execFileSync("shasum", ["-a", "256", path], { encoding: "utf8" }).split(" ")[0];
}

function fetchVerified({ file, url, sha256 }) {
  const path = join(cache, file);
  if (!existsSync(path) || checksum(path) !== sha256) {
    const partial = `${path}.partial`;
    rmSync(partial, { force: true });
    execFileSync("curl", ["--fail", "--location", "--retry", "3", "--output", partial, url], { stdio: "inherit" });
    if (checksum(partial) !== sha256) {
      rmSync(partial, { force: true });
      throw new Error(`SHA-256 mismatch for ${file}`);
    }
    renameSync(partial, path);
  }
  return path;
}

mkdirSync(cache, { recursive: true });
const [cli, license] = artifacts.map(fetchVerified);
rmSync(bundle, { recursive: true, force: true });
mkdirSync(bundle, { recursive: true });
copyFileSync(cli, join(bundle, "agent-browser"));
chmodSync(join(bundle, "agent-browser"), 0o755);
mkdirSync(join(bundle, "licenses", "agent-browser"), { recursive: true });
copyFileSync(license, join(bundle, "licenses", "agent-browser", "LICENSE"));
console.log(`Browser bundle ready: ${bundle}`);
