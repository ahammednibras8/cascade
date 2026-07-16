import { describe, expect, it } from "vitest";
import { createPackageInfo, packageName } from "../src/index.js";

describe("@cascade/core", () => {
  it("creates package info", () => {
    expect(createPackageInfo("0.0.0")).toEqual({
      name: packageName,
      version: "0.0.0",
    });
  });
});
