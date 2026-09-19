import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const declarationPath = fileURLToPath(new URL("../dist/esm/index.d.ts", import.meta.url));

describe("public package", () => {
  it("builds declarations without private workspace imports", () => {
    execFileSync("pnpm", ["run", "build"], {
      cwd: packageDirectory,
      stdio: "pipe",
    });

    const declaration = readFileSync(declarationPath, "utf8");

    expect(declaration).not.toContain("@cascade/");
    expect(declaration).not.toMatch(/from ["']\.\/(?:common|task)\.js["']/);
  });
});
