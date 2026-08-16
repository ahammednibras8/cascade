import { Form, useNavigation } from "react-router";
import type { Deployment } from "./types";

type DeploymentActionsProps = {
  deployment: Deployment;
};

function isSubmittingIntent(
  intent: "deactivate" | "rollback",
  navigation: ReturnType<typeof useNavigation>,
) {
  return navigation.state === "submitting" && navigation.formData?.get("intent") === intent;
}

export function DeploymentActions({ deployment }: DeploymentActionsProps) {
  const navigation = useNavigation();

  if (deployment.status === "ACTIVE") {
    const isSubmitting = isSubmittingIntent("deactivate", navigation);

    return (
      <div className="mt-4">
        <Form method="post">
          <button
            type="submit"
            name="intent"
            value="deactivate"
            disabled={isSubmitting}
            onClick={(event) => {
              const confirmed = window.confirm(
                `Deactivate deployment "${deployment.version}"? This disables its tasks and pauses their enabled schedules. Existing runs will drain.`,
              );

              if (!confirmed) {
                event.preventDefault();
              }
            }}
            className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Deactivating..." : "Deactivate deployment"}
          </button>
        </Form>

        <p className="mt-2 text-xs text-gray-500">
          New task triggers are disabled for this deployment. Existing task runs are allowed to
          drain.
        </p>
      </div>
    );
  }

  if (deployment.status !== "INACTIVE") {
    return null;
  }

  if (!deployment.canRollback) {
    return (
      <p className="mt-4 text-sm text-gray-500">
        Rollback is unavailable because this deployment has no saved task manifest.
      </p>
    );
  }

  const isSubmitting = isSubmittingIntent("rollback", navigation);

  return (
    <div className="mt-4">
      <Form method="post">
        <button
          type="submit"
          name="intent"
          value="rollback"
          disabled={isSubmitting}
          onClick={(event) => {
            const confirmed = window.confirm(
              `Roll back to deployment "${deployment.version}"? This makes it active, disables the currently active deployment, restores its saved task manifest, and leaves schedules paused.`,
            );

            if (!confirmed) {
              event.preventDefault();
            }
          }}
          className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Rolling back..." : "Roll back deployment"}
        </button>
      </Form>

      <p className="mt-2 text-xs text-gray-500">
        The previously active deployment will be deactivated. Restored schedules remain paused until
        you explicitly enable them.
      </p>
    </div>
  );
}
