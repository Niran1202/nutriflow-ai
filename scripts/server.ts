/**
 * NutriFlow live server — owner tools. Runs on the Oracle Cloud VM (see
 * deploy/oracle/), where the live data lives in server-data/ (separate from the
 * local demo database). From your PC, deploy/oracle/manage.sh runs these on
 * the server over SSH.
 *
 *   npm run server:setup                               create / migrate the live database
 *   npm run server:dietitian -- --name "Jothi" --email jothi@example.com [--password "…"]
 *                                                      create a dietitian, or reset their password
 *   npm run server:list                                list dietitians and patient counts
 *   npm run server:start                               build (if needed) and run the server on 127.0.0.1:3000
 *                                                      (run by systemd; Caddy serves it over HTTPS)
 */
import "dotenv/config";
import { spawn, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "server-data");
const DB_FILE = path.join(DATA_DIR, "nutriflow.db");
const LIVE_DB_URL = `file:${DB_FILE.replace(/\\/g, "/")}`;
const PORT = Number(process.env.NUTRIFLOW_PORT ?? 3000);

// Everything below talks to the live database, never the demo one.
process.env.DATABASE_URL = LIVE_DB_URL;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function setup() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const { applyMigrations } = await import("../src/lib/migrate");
  const applied = await applyMigrations(LIVE_DB_URL, path.join(ROOT, "prisma", "migrations"));
  console.log(applied.length ? `✓ Applied ${applied.join(", ")}` : "✓ Live database is up to date");
  console.log(`  ${DB_FILE}`);
}

function generatePassword() {
  // 14 characters, no look-alikes (0/O, 1/l/I).
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(14), (b) => alphabet[b % alphabet.length]).join("");
}

async function dietitian() {
  const name = arg("name")?.trim();
  const email = arg("email")?.trim().toLowerCase();
  let password = arg("password");
  if (!email) throw new Error('Usage: npm run server:dietitian -- --name "Full Name" --email someone@example.com [--password "…"]');
  if (password !== undefined && password.length < 8) throw new Error("Password must be at least 8 characters");
  const generated = password === undefined;
  password ??= generatePassword();

  await setup();
  const { prisma } = await import("../src/lib/db");
  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(password, 10);
  if (existing) {
    if (existing.role !== "DIETITIAN") throw new Error(`${email} belongs to a patient account`);
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, ...(name ? { name } : {}) } });
    await prisma.session.deleteMany({ where: { userId: existing.id } }); // sign out old sessions
    console.log(`\n✓ Password reset for dietitian ${existing.name}`);
  } else {
    if (!name) throw new Error("--name is required when creating a dietitian");
    await prisma.user.create({ data: { name, email, passwordHash, role: "DIETITIAN" } });
    console.log(`\n✓ Created dietitian ${name}`);
  }
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${generated ? password : "(as given)"}`);
  if (generated) console.log("  Share this password privately — it isn't stored anywhere in readable form.");
  await prisma.$disconnect();
}

async function list() {
  await setup();
  const { prisma } = await import("../src/lib/db");
  const dietitians = await prisma.user.findMany({
    where: { role: "DIETITIAN" },
    include: { _count: { select: { patients: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!dietitians.length) console.log("No dietitians yet. Create one with npm run server:dietitian");
  for (const d of dietitians) console.log(`• ${d.name} <${d.email}> — ${d._count.patients} patient(s)`);
  await prisma.$disconnect();
}

function copyDir(from: string, to: string) {
  fs.rmSync(to, { recursive: true, force: true });
  if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true }); // public/ is optional
}

async function start() {
  await setup();
  const standalone = path.join(ROOT, ".next", "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js")) || process.argv.includes("--rebuild")) {
    console.log("› Building NutriFlow…");
    execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  }
  copyDir(path.join(ROOT, ".next", "static"), path.join(standalone, ".next", "static"));
  copyDir(path.join(ROOT, "public"), path.join(standalone, "public"));

  console.log(`\n› NutriFlow server on http://127.0.0.1:${PORT}\n`);
  const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
    cwd: standalone,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1", // only reachable through Caddy on the same machine
      DATABASE_URL: LIVE_DB_URL,
    },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

const commands: Record<string, () => Promise<void>> = { setup, dietitian, list, start };
const cmd = process.argv[2];
if (!cmd || !commands[cmd]) {
  console.log("Commands: setup | dietitian | list | start");
  process.exit(1);
}
commands[cmd]().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
