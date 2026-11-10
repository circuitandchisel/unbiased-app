// Bundle the exact runtime versions SSH connections must already have installed.
const { mkdirSync, copyFileSync, existsSync } = require("node:fs");
const { resolve, join } = require("node:path");
const bundle = process.env.UNBIASED_ENGINE_DIR ? resolve(process.env.UNBIASED_ENGINE_DIR) : resolve(__dirname, "../../unbiased-app-engine/dist/bundle");
const source = resolve(bundle, "../..");
for (const name of ["engine.lock", "VERSION"]) {
  if (!existsSync(join(source, name))) throw new Error("SSH metadata requires the standalone-release app-engine checkout: missing " + name);
}
mkdirSync(join(bundle, "remote"), { recursive: true });
for (const name of ["engine.lock", "VERSION"]) copyFileSync(join(source, name), join(bundle, "remote", name));
console.log("Prepared pinned SSH runtime metadata; remote installation stays manual");
