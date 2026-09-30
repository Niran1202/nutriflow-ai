// Builds the shareable Windows app for a given NutriFlow server:
//   npm run dist -- --server https://<ip-with-dashes>.sslip.io
// 1. writes the server address into app-config.json
// 2. packages the installer + portable exe with electron-builder
// 3. copies just those two files into ../download
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const run = (cmd, args) =>
  execFileSync(cmd, args, {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    shell: process.platform === "win32", // npx is a .cmd shim on Windows
    // electron-builder must not inherit ELECTRON_RUN_AS_NODE from an editor terminal.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });

try {
  run("node", ["scripts/set-server.js", ...process.argv.slice(2)]);
  run("npx", ["electron-builder", "--win", "nsis", "portable"]);
  run("node", ["scripts/collect.js"]);
} catch {
  process.exit(1);
}
