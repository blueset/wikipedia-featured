import { mkdir } from "fs/promises";
import { tfa } from "./tfa/index.js";
import { wotd } from "./wotd/index.js";
import { frontpage } from "./frontpage/index.js";

async function main() {
  await mkdir("dist", { recursive: true });
  await tfa();
  await wotd();
  await frontpage();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
