export function isDeploymentNotFoundError(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }

  const candidate = error as {
    status?: unknown;
    responseBody?: {
      error?: {
        code?: unknown;
      };
    };
  };

  return candidate.status === 404 && candidate.responseBody?.error?.code === "DEPLOYMENT_NOT_FOUND";
}
