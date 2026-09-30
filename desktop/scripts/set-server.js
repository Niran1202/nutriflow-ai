// Writes app-config.json with the server address the desktop app opens by default.
// Usage: node scripts/set-server.js --server https://your-address
//   (falls back to server-data/public-url.txt written by `npm run server:tunnel`)
// Only the address is written — never any account details.
const fs = require("node:fs");
const path = require("node:path");

const i = process.argv.indexOf("--server");
let url = i > -1 ? process.argv[i + 1] : process.env.NUTRIFLOW_SERVER_URL;
const tunnelFile = path.resolve(__dirname, "..", "..", "server-data", "public-url.txt");
if (!url && fs.existsSync(tunnelFile)) url = fs.readFileSync(tunnelFile, "utf8").trim();
if (!url) {
  console.error("✗ No server address. Pass --server https://… (or run `npm run server:tunnel` first).");
  process.exit(1);
}
const parsed = new URL(url);
if (parsed.protocol !== "https:") {
  console.error("✗ The server address must start with https://");
  process.exit(1);
}
fs.writeFileSync(path.resolve(__dirname, "..", "app-config.json"), JSON.stringify({ serverUrl: parsed.origin }, null, 2) + "\n");
console.log(`✓ Desktop app will connect to ${parsed.origin}`);
