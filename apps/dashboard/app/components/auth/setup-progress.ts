export type AuthStage = "authentication" | "workspace" | "activation";

const stageOrder: AuthStage[] = ["authentication", "workspace", "activation"];

export function getDurableProgressStage(input: {
  hasPersistedSession: boolean;
  loaderStage: AuthStage;
}): AuthStage {
  if (input.loaderStage === "authentication" && input.hasPersistedSession) {
    return "workspace";
  }

  return input.loaderStage;
}

export function getSetupStepState(
  progressStage: AuthStage,
  step: AuthStage,
): "active" | "complete" | "pending" {
  const progressIndex = stageOrder.indexOf(progressStage);
  const stepIndex = stageOrder.indexOf(step);

  if (stepIndex < progressIndex) {
    return "complete";
  }

  if (stepIndex === progressIndex) {
    return "active";
  }

  return "pending";
}

export function isSetupStepViewable(progressStage: AuthStage, step: AuthStage) {
  return stageOrder.indexOf(step) <= stageOrder.indexOf(progressStage);
}
