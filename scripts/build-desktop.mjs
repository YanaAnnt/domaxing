// Builds the Windows desktop app: static export of the web app into dist-web/, then an installer in dist-desktop/.
// Usage: npm run desktop:build      (add --dir to only produce the unpacked app, which is faster)
// Everything this touches stays inside the project: downloads are cached in .desktop/cache.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cache = path.resolve(".desktop", "cache");
const env = {
  ...process.env,
  ELECTRON_CACHE: path.join(cache, "electron"),
  electron_config_cache: path.join(cache, "electron"),
  ELECTRON_BUILDER_CACHE: path.join(cache, "electron-builder"),
};
const run = (cmd, extra = {}) => execSync(cmd, { stdio: "inherit", env: { ...env, ...extra } });

fs.rmSync("dist-web", { recursive: true, force: true });
// Root base path (the desktop app serves from app://domaxing/), separate build folder so a running dev server is untouched.
run("npx next build", { STATIC_EXPORT: "1", NEXT_PUBLIC_BASE_PATH: "", NEXT_DIST_DIR: "dist-web" });
run(`npx electron-builder --win ${process.argv.slice(2).join(" ")} --publish never -c.electronDownload.cache="${path.join(cache, "electron")}"`);
