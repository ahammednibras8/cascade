export type DashboardActivationState =
  | { state: "AUTH_REQUIRED" }
  | { state: "WORKSPACE_REQUIRED" }
  | { state: "CREDENTIAL_REQUIRED"; environmentId: string }
  | { state: "STARTER_REQUIRED"; environmentId: string }
  | {
      state: "DEPLOYMENT_PENDING";
      deploymentId: string;
      environmentId: string;
      runtimeStatus: "PENDING" | "STARTING" | "DRAINING" | "STOPPED" | "FAILED";
    }
  | { state: "FIRST_RUN_PENDING"; deploymentId: string; environmentId: string }
  | { state: "ACTIVATED"; deploymentId: string; environmentId: string };

export type PendingDashboardActivationState = Exclude<
  DashboardActivationState,
  { state: "AUTH_REQUIRED" | "WORKSPACE_REQUIRED" | "ACTIVATED" }
>;
