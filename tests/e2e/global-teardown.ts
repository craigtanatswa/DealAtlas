import fs from "node:fs";

import { deleteE2ESeed, readSeed, SEED_PATH } from "./helpers/seed";

export default async function globalTeardown() {
  if (!fs.existsSync(SEED_PATH)) {
    return;
  }
  const seed = readSeed();
  await deleteE2ESeed(seed);
}
