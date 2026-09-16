import { createE2ESeed } from "./helpers/seed";

export default async function globalSetup() {
  await createE2ESeed();
}
