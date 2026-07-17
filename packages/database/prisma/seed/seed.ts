import { prisma } from "../../src/index.js";

async function main() {
  console.log("No seed data yet.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
