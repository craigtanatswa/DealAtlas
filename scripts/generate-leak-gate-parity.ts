import fs from "node:fs";

import {
  LEAK_GATE_PARITY_SQL_PATH,
  renderLeakGateParitySql,
} from "../tests/helpers/leak-gate-parity";

fs.writeFileSync(LEAK_GATE_PARITY_SQL_PATH, renderLeakGateParitySql());
console.log(`Wrote ${LEAK_GATE_PARITY_SQL_PATH}`);
