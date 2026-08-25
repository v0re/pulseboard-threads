import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("請先設定 DATABASE_URL");

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(here, "..", "migrations");
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
  .sort((left, right) => left.localeCompare(right, "en"));
if (!migrationFiles.length) throw new Error("找不到 migration 檔案");

const sql = neon(databaseUrl);
await sql.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`);

for (const fileName of migrationFiles) {
  const migrationId = fileName.replace(/\.sql$/i, "");
  const applied = await sql.query("SELECT 1 FROM schema_migrations WHERE id=$1 LIMIT 1", [migrationId]);
  if (applied.length) {
    console.log(`Migration already applied (${migrationId}).`);
    continue;
  }

  const sqlText = await readFile(join(migrationsDirectory, fileName), "utf8");
  const statements = sqlText.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
  await sql.transaction([
    ...statements.map((statement) => sql.query(statement)),
    sql.query("INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [migrationId]),
  ]);
  console.log(`Migration complete (${migrationId}, ${statements.length} statements).`);
}
