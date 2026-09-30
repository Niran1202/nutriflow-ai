import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

/**
 * Apply pending SQL migrations (from `prisma/migrations`) to a SQLite database.
 * Used by `npm run server:setup` so the live server doesn't need the Prisma CLI.
 * Returns the names of the migrations applied.
 */
export async function applyMigrations(url: string, dir: string): Promise<string[]> {
  const db = createClient({ url });
  try {
    await db.execute("CREATE TABLE IF NOT EXISTS _nutriflow_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const done = new Set((await db.execute("SELECT name FROM _nutriflow_migrations")).rows.map((r) => String(r.name)));
    const pending = readdirSync(dir)
      .filter((name) => existsSync(path.join(dir, name, "migration.sql")) && !done.has(name))
      .sort();
    for (const name of pending) {
      await db.executeMultiple(readFileSync(path.join(dir, name, "migration.sql"), "utf8"));
      await db.execute({ sql: "INSERT INTO _nutriflow_migrations (name, applied_at) VALUES (?, ?)", args: [name, new Date().toISOString()] });
    }
    return pending;
  } finally {
    db.close();
  }
}
