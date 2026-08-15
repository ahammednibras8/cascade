import { execFileSync } from "node:child_process";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

run("pnpm", ["--filter", "@cascade/database", "run", "db:generate"], {
  stdio: "inherit",
});

const generatedPath = "packages/database/src/generated/prisma";
const changes = run("git", ["status", "--porcelain", "--", generatedPath]);

if (changes.trim()) {
  process.stderr.write(
    `Prisma generated files are stale. Run \`pnpm run db:generate\` and commit changes in ${generatedPath}.\n`,
  );
  process.exit(1);
}
