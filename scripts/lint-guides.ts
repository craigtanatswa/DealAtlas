/**
 * Guide content lint. Checks every markdown guide for outbound and internal
 * links, source-identifying leaks and the required frontmatter.
 *
 *   npm run lint:guides            # lints content/guides
 *   npm run lint:guides -- <dir>   # lints another directory
 *
 * Each failure prints `file:line [rule] message`. Exit code 1 on any failure.
 * Reads repository files only: no network, no database, no secrets.
 */
import path from "node:path";

import { buildContext, formatFailure, guideFiles, lintGuideDir } from "./guide-lint/lint";

const root = process.cwd();
const guidesDir = path.resolve(root, process.argv[2] ?? path.join("content", "guides"));
const ctx = buildContext({ guidesDir, appDir: path.join(root, "app") });
const files = guideFiles(guidesDir);
const failures = lintGuideDir(guidesDir, ctx);

for (const failure of failures) {
  console.log(formatFailure(failure, root));
}
const failedFiles = new Set(failures.map((failure) => failure.file)).size;
console.log(
  failures.length === 0
    ? `Guide content lint: ${files.length} guide(s), no failures.`
    : `Guide content lint: ${failures.length} failure(s) in ${failedFiles} of ${files.length} guide(s).`,
);
if (failures.length > 0 || files.length === 0) {
  if (files.length === 0) console.log(`No guides found in ${path.relative(root, guidesDir) || "."}.`);
  process.exitCode = 1;
}
