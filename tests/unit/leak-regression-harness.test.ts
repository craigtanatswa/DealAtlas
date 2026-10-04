import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { reflectionParity } from "../leak/lib/scan";

describe("leak harness", () => {
  it("judges echoes by control-request count parity and does not mask them", () => {
    expect(typeof reflectionParity).toBe("function");
    const roots = ["scripts", "tests"];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(full);
        } else if (/\.(ts|mjs|js)$/.test(entry.name) && /(?:function|const) maskEcho\b/.test(fs.readFileSync(full, "utf8"))) {
          hits.push(full);
        }
      }
    };
    for (const root of roots) walk(root);
    expect(hits).toEqual([]);
  });
});
