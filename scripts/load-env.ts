import fs from "node:fs";
import path from "node:path";

export function loadEnvFiles(
  files = [".env.local", ".env"],
  env: Record<string, string | undefined> = process.env,
): void {
  for (const file of files) {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) {
      continue;
    }
    const text = fs.readFileSync(fullPath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const stripped = line.startsWith("export ")
        ? line.slice("export ".length)
        : line;
      const eq = stripped.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = stripped.slice(0, eq).trim();
      let value = stripped.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (env[key] == null || env[key] === "") {
        env[key] = value;
      }
    }
  }
}
