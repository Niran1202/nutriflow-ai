// Writes app-config.json with the server address the desktop app opens by default.
// Usage: node scripts/set-server.js --server https://<ip-with-dashes>.sslip.io
//   (or set NUTRIFLOW_SERVER_URL). Use the address printed by deploy/oracle/deploy.sh.
// Only the address is written — never any account details.
const fs = require("node:fs");
const path = require("node:path");

const i = process.argv.indexOf("--server");
const url = i > -1 ? process.argv[i + 1] : process.env.NUTRIFLOW_SERVER_URL;
if (!url) {
  console.error("✗ No server address. Pass --server https://… (the address printed by deploy/oracle/deploy.sh).");
  process.exit(1);
}
let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(`✗ "${url}" is not a valid address.`);
  process.exit(1);
}
if (parsed.protocol !== "https:") {
  console.error("✗ The server address must start with https://");
  process.exit(1);
}
fs.writeFileSync(path.resolve(__dirname, "..", "app-config.json"), JSON.stringify({ serverUrl: parsed.origin }, null, 2) + "\n");
console.log(`✓ Desktop app will connect to ${parsed.origin}`);
