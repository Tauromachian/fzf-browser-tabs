// Copy the per-browser manifest into its self-contained dist root:
// manifests/manifest.<browser>.json -> dist/<browser>/manifest.json
import { copyFile, mkdir } from "node:fs/promises";

const browser = process.argv[2];
if (browser !== "firefox" && browser !== "chrome") {
  console.error("usage: node scripts/copy-manifest.mjs <firefox|chrome>");
  process.exit(1);
}

await mkdir(`dist/${browser}`, { recursive: true });
await copyFile(`manifests/manifest.${browser}.json`, `dist/${browser}/manifest.json`);
console.log(`manifest ${browser} OK`);
