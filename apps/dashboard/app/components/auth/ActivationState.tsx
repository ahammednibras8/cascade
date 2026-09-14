import { ArrowRight } from "lucide-react";
import GlassButton from "~/components/landing/GlassButton";
import type { PendingDashboardActivationState } from "~/lib/activation/activation-state";
import ActivationCredentialState from "./ActivationCredentialState";

export default function ActivationState({
  activationState,
  checking,
  onCheck,
}: {
  activationState: PendingDashboardActivationState;
  checking: boolean;
  onCheck: () => void;
}) {
  if (activationState.state === "CREDENTIAL_REQUIRED") {
    return <ActivationCredentialState checking={checking} onCheck={onCheck} />;
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
          <code>{`import { createCascadeClient } from "@cascade/sdk";
          import { hello } from "./tasks/hello.js";

          const cascade = createCascadeClient({
            baseUrl: process.env["CASCADE_API_URL"]!,
            apiKey: process.env["CASCADE_API_KEY"]!,
          });

          await cascade.registerDeployment({
            version: "v1",
            image: "ghcr.io/your-org/your-worker:v1",
            tasks: [
              {
                task: hello,
                name: "Hello",
              },
            ],
          });`}</code>
        </pre>
        <div className="mt-6">
          <GlassButton
            label={checking ? "Checking..." : "Check deployment"}
            icon={ArrowRight}
            onClick={onCheck}
            disabled={checking}
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
            label={checking ? "Checking..." : "Check again"}
            icon={ArrowRight}
            onClick={onCheck}
            disabled={checking}
            tone="white"
            size="large"
            fullWidth
          />
        </div>
      </>
    );
  }

  return <FirstRunActivationState checking={checking} onCheck={onCheck} />;
}

function FirstRunActivationState({
  checking,
  onCheck,
}: {
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <>
      <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
        Trigger your first run
      </h1>
      <p className="mt-3 text-sm leading-6 text-black/50">
        Trigger one task through the SDK. A completed run activates this workspace.
      </p>
      <pre className="mt-6 overflow-x-auto rounded-2xl bg-[#10140f] p-4 text-xs leading-6 text-white/85">
        <code>{`import { createCascadeClient } from "@cascade/sdk";
        import { hello } from "./tasks/hello.js";
        
        const cascade = createCascadeClient({
          baseUrl: process.env["CASCADE_API_URL"]!,
          apiKey: process.env["CASCADE_API_KEY"]!,
        });
        
        const run = await cascade.triggerTask(hello, {
          payload: { message: "Hello, Cascade" },
          idempotencyKey: crypto.randomUUID(),
        });
        
        console.log(run.id);`}</code>
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
          label={checking ? "Checking..." : "Check activation"}
          icon={ArrowRight}
          onClick={onCheck}
          disabled={checking}
          tone="white"
          size="large"
          fullWidth
        />
      </div>
    </>
  );
}
