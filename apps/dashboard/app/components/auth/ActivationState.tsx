import { ArrowRight } from "lucide-react";
import GlassButton from "~/components/landing/GlassButton";
import type { PendingDashboardActivationState } from "~/lib/activation/activation-state";

export default function ActivationState({
  activationState,
  returnTo,
}: {
  activationState: PendingDashboardActivationState;
  returnTo: string;
}) {
  const checkActivationHref = `/login?returnTo=${encodeURIComponent(returnTo)}`;

  if (activationState.state === "CREDENTIAL_REQUIRED") {
    return (
      <>
        <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
          Create an integration key
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/50">
          Create one active key with deployment creation, task triggering, and run-reading
          permissions. Save the secret in the environment that registers your deployment.
        </p>
        <div className="mt-8 space-y-3">
          <GlassButton
            label="Create API key"
            icon={ArrowRight}
            to="/api-keys"
            tone="black"
            size="large"
            fullWidth
          />
          <GlassButton
            label="I created the key"
            icon={ArrowRight}
            href={checkActivationHref}
            tone="white"
            size="large"
            fullWidth
          />
        </div>
      </>
    );
  }

  if (activationState.state === "STARTER_REQUIRED") {
    return (
      <>
        <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
          Register your first deployment
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/50">
          Run the deployment registration code from your worker project using the API key you just
          created.
        </p>
        <pre className="mt-6 overflow-x-auto rounded-2xl bg-[#10140f] p-4 text-xs leading-6 text-white/85">
          <code>{`await cascade.registerDeployment({
  version: "v1",
  image: "your-registry/your-worker:v1",
  tasks: [{ task: hello }],
});`}</code>
        </pre>
        <div className="mt-6">
          <GlassButton
            label="Check deployment"
            icon={ArrowRight}
            href={checkActivationHref}
            tone="black"
            size="large"
            fullWidth
          />
        </div>
      </>
    );
  }

  if (activationState.state === "DEPLOYMENT_PENDING") {
    return (
      <>
        <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
          Starting your deployment
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/50">
          Cascade registered your deployment. Its current runtime state is{" "}
          <strong>{activationState.runtimeStatus}</strong>.
        </p>
        <div className="mt-8 space-y-3">
          <GlassButton
            label="View deployment status"
            icon={ArrowRight}
            to={`/deployments/${activationState.deploymentId}`}
            tone="black"
            size="large"
            fullWidth
          />
          <GlassButton
            label="Check again"
            icon={ArrowRight}
            href={checkActivationHref}
            tone="white"
            size="large"
            fullWidth
          />
        </div>
      </>
    );
  }

  return <FirstRunActivationState checkActivationHref={checkActivationHref} />;
}

function FirstRunActivationState({ checkActivationHref }: { checkActivationHref: string }) {
  return (
    <>
      <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
        Trigger your first run
      </h1>
      <p className="mt-3 text-sm leading-6 text-black/50">
        Trigger one task through the SDK. A completed run activates this workspace.
      </p>
      <pre className="mt-6 overflow-x-auto rounded-2xl bg-[#10140f] p-4 text-xs leading-6 text-white/85">
        <code>{`await cascade.triggerTask(hello, {
  payload: { message: "Hello, Cascade" },
  idempotencyKey: crypto.randomUUID(),
});`}</code>
      </pre>
      <div className="mt-6 space-y-3">
        <GlassButton
          label="View runs"
          icon={ArrowRight}
          to="/runs"
          tone="black"
          size="large"
          fullWidth
        />
        <GlassButton
          label="Check activation"
          icon={ArrowRight}
          href={checkActivationHref}
          tone="white"
          size="large"
          fullWidth
        />
      </div>
    </>
  );
}
