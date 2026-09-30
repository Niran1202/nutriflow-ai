// Copies only the two distributable files into ../download — nothing else
// (no configs, logs or build metadata) ends up in the folder you share.
const fs = require("node:fs");
const path = require("node:path");

const { version } = require("../package.json");
const release = path.resolve(__dirname, "..", "release");
const out = path.resolve(__dirname, "..", "..", "download");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of [`NutriFlow-AI-Setup-${version}.exe`, `NutriFlow-AI-Portable-${version}.exe`]) {
  fs.copyFileSync(path.join(release, name), path.join(out, name));
  console.log(`✓ download/${name}`);
}
