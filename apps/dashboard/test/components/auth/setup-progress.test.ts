import { describe, expect, it } from "vitest";
import {
  getDurableProgressStage,
  getSetupStepState,
  isSetupStepViewable,
} from "../../../app/components/auth/setup-progress.js";

describe("setup progress", () => {
  it("keeps workspace active after a persisted sign-in", () => {
    expect(
      getDurableProgressStage({
        hasPersistedSession: true,
        loaderStage: "authentication",
      }),
    ).toBe("workspace");
  });

  it("keeps completed steps complete while the user views an earlier step", () => {
    expect(getSetupStepState("activation", "authentication")).toBe("complete");
    expect(getSetupStepState("activation", "workspace")).toBe("complete");
    expect(getSetupStepState("activation", "activation")).toBe("active");
  });

  it("allows viewing completed and current steps only", () => {
    expect(isSetupStepViewable("activation", "authentication")).toBe(true);
    expect(isSetupStepViewable("activation", "workspace")).toBe(true);
    expect(isSetupStepViewable("activation", "activation")).toBe(true);
    expect(isSetupStepViewable("workspace", "activation")).toBe(false);
  });
});
