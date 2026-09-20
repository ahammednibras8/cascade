import { ArrowRight, Clock3, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import GlassButton from "~/components/landing/GlassButton";
import type { PendingDashboardActivationState } from "~/lib/activation/activation-state";
import ActivationCredentialState from "./ActivationCredentialState";

const ACTIVATION_POLL_INTERVAL_MS = 3_000;

export default function ActivationState({
  activationState,
  checking,
  onCheck,
  returnTo,
}: {
  activationState: PendingDashboardActivationState;
  checking: boolean;
  onCheck: () => void;
  returnTo: string;
}) {
  const shouldPoll =
    activationState.state === "FIRST_RUN_PENDING" ||
    (activationState.state === "DEPLOYMENT_PENDING" && activationState.runtimeStatus !== "FAILED");

  useEffect(() => {
    if (!shouldPoll || checking) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onCheck();
    }, ACTIVATION_POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [checking, onCheck, shouldPoll]);

  if (activationState.state === "CREDENTIAL_REQUIRED") {
    return (
      <>
        <ActivationCredentialState checking={checking} onCheck={onCheck} />
        <ActivationDismissControl returnTo={returnTo} />
      </>
    );
  }

  if (activationState.state === "STARTER_REQUIRED") {
    return (
      <>
        <StarterActivationState checking={checking} onCheck={onCheck} />
        <ActivationDismissControl returnTo={returnTo} />
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
        {activationState.runtimeStatus === "FAILED" ? (
          <p
            role="alert"
            className="mt-4 rounded-2xl border border-red-900/10 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
          >
            The deployment worker failed to start. Open the deployment details to inspect its
            runtime error.
          </p>
        ) : (
          <p className="mt-3 text-xs leading-5 text-black/45">
            Cascade checks the deployment automatically every three seconds.
          </p>
        )}
        <div className="mt-8">
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
        <ActivationDismissControl returnTo={returnTo} />
      </>
    );
  }

  return (
    <>
      <FirstRunActivationState checking={checking} onCheck={onCheck} />
      <ActivationDismissControl returnTo={returnTo} />
    </>
  );
}

function StarterActivationState({ checking, onCheck }: { checking: boolean; onCheck: () => void }) {
  const [deploymentImage, setDeploymentImage] = useState("");
  const image = deploymentImage.trim();

  const commands = [
    "git clone --depth 1 https://github.com/ahammednibras8/cascade.git",
    "cd cascade/examples/typescript-starter",
    "cp .env.example .env",
    "pnpm install --frozen-lockfile",
    "",
    `export CASCADE_DEPLOYMENT_IMAGE="${image}"`,
    'docker build --tag "$CASCADE_DEPLOYMENT_IMAGE" .',
    'docker push "$CASCADE_DEPLOYMENT_IMAGE"',
    "pnpm run register",
  ].join("\n");

  return (
    <>
      <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
        Deploy your first task
      </h1>

      <p className="mt-3 text-sm leading-6 text-black/50">
        Clone the TypeScript starter, add your saved API values to its <code>.env</code> file, then
        build and register the worker image.
      </p>

      <label
        htmlFor="starter-deployment-image"
        className="mt-6 block text-sm font-medium text-black/65"
      >
        Container image
      </label>

      <input
        id="starter-deployment-image"
        type="text"
        value={deploymentImage}
        onChange={(event) => setDeploymentImage(event.target.value)}
        placeholder="ghcr.io/your-user/cascade-hello:0.1.0"
        spellCheck={false}
        autoComplete="off"
        className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white/70 px-4 font-mono text-xs text-[#05050c] outline-none transition focus:border-black/30 focus:bg-white"
      />

      <p className="mt-2 text-xs leading-5 text-black/45">
        Use a registry path that your Cascade deployment runtime can pull.
      </p>

      <pre className="mt-5 max-h-64 overflow-auto rounded-2xl bg-[#10140f] p-4 font-mono text-xs leading-6 text-white/85">
        <code>{commands}</code>
      </pre>

      <div className="mt-6 space-y-3">
        <GlassButton
          label="Copy setup commands"
          icon={Copy}
          onClick={() => {
            void navigator.clipboard.writeText(commands);
          }}
          disabled={!image}
          tone="black"
          size="large"
          fullWidth
        />

        <GlassButton
          label={checking ? "Checking deployment…" : "Check deployment"}
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

function FirstRunActivationState({
  checking,
  onCheck,
}: {
  checking: boolean;
  onCheck: () => void;
}) {
  const triggerCommand = "pnpm run trigger";

  return (
    <>
      <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
        Trigger your first run
      </h1>

      <p className="mt-3 text-sm leading-6 text-black/50">
        From the same TypeScript starter directory, trigger the registered <code>hello</code> task.
        Cascade activates this workspace only after the worker completes the run.
      </p>

      <p className="mt-3 text-xs leading-5 text-black/45">
        This page checks automatically and opens the completed run when it is ready.
      </p>

      <pre className="mt-6 overflow-x-auto rounded-2xl bg-[#10140f] p-4 font-mono text-xs leading-6 text-white/85">
        <code>{triggerCommand}</code>
      </pre>

      <div className="mt-6 space-y-3">
        <GlassButton
          label="Copy trigger command"
          icon={Copy}
          onClick={() => {
            void navigator.clipboard.writeText(triggerCommand);
          }}
          tone="black"
          size="large"
          fullWidth
        />

        <GlassButton
          label={checking ? "Checking run…" : "Check activation"}
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

function ActivationDismissControl({ returnTo }: { returnTo: string }) {
  const fetcher = useFetcher<{ ok: boolean; redirectTo?: string }>();
  const navigate = useNavigate();
  const dismissing =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "dismiss_onboarding";

  useEffect(() => {
    if (fetcher.data?.redirectTo) {
      void navigate(fetcher.data.redirectTo, { replace: true });
    }
  }, [fetcher.data?.redirectTo, navigate]);

  return (
    <fetcher.Form method="post" action="/login" className="mt-3">
      <input type="hidden" name="intent" value="dismiss_onboarding" />
      <input type="hidden" name="returnTo" value={returnTo} />

      <GlassButton
        label={dismissing ? "Opening dashboard…" : "Set up later"}
        icon={Clock3}
        type="submit"
        disabled={dismissing}
        tone="white"
        size="large"
        fullWidth
      />
    </fetcher.Form>
  );
}
