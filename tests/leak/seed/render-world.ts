import fs from "node:fs";
import path from "node:path";

import { activeDateSet, transformString } from "../lib/date-set";
import { ROOT } from "../lib/env";

const source = path.join(ROOT, "tests/leak/seed/world.sql");
process.stdout.write(transformString(fs.readFileSync(source, "utf8"), activeDateSet()));
