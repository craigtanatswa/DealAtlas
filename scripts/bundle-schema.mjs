import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const OUTPUT = path.join(ROOT, "supabase", "dealatlas_full_schema.sql");

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

if (files.length === 0) {
  throw new Error("No migration files found.");
}

const parts = files.map((name) => {
  const body = fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8").trimEnd();
  return [
    "-- ============================================================================",
    `-- BEGIN ${name}`,
    "-- ============================================================================",
    "",
    body,
    "",
    "-- ============================================================================",
    `-- END ${name}`,
    "-- ============================================================================",
  ].join("\n");
});

fs.writeFileSync(OUTPUT, `${parts.join("\n\n")}\n`, "utf8");
console.log(`Wrote ${path.relative(ROOT, OUTPUT)} from ${files.length} migrations.`);
