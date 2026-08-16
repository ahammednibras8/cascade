import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

function snapshotDirectory(rootPath) {
  const files = new Map();

  if (!existsSync(rootPath)) {
    return files;
  }

  function walk(directory) {
    for (const entry of readdirSync(directory).toSorted()) {
      const absolutePath = path.join(directory, entry);
      const relativePath = path.relative(rootPath, absolutePath);
      const stats = statSync(absolutePath);

      if (stats.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!stats.isFile()) {
        continue;
      }

      files.set(
        relativePath,
        createHash("sha256").update(readFileSync(absolutePath)).digest("hex"),
      );
    }
  }

  walk(rootPath);
  return files;
}

function snapshotsMatch(before, after) {
  if (before.size !== after.size) {
    return false;
  }

  for (const [filePath, hash] of before) {
    if (after.get(filePath) !== hash) {
      return false;
    }
  }

  return true;
}

const generatedPath = "packages/database/src/generated/prisma";
const before = snapshotDirectory(generatedPath);

run("pnpm", ["--filter", "@cascade/database", "run", "db:generate"], {
  stdio: "inherit",
});

const after = snapshotDirectory(generatedPath);

if (!snapshotsMatch(before, after)) {
  process.stderr.write(
    `Prisma generated files are stale. Run \`pnpm run db:generate\` and commit changes in ${generatedPath}.\n`,
  );
  process.exit(1);
}
