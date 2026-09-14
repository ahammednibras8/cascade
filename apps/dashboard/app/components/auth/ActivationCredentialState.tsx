import { ArrowRight, Copy } from "lucide-react";
import { useFetcher } from "react-router";
import GlassButton from "~/components/landing/GlassButton";
import type { ApiKeyActionData } from "~/features/api-keys/types";

export default function ActivationCredentialState({
  checking,
  onCheck,
}: {
  checking: boolean;
  onCheck: () => void;
}) {
  const fetcher = useFetcher<ApiKeyActionData>();
  const isCreating =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "create_activation_key";

  const createdApiKey = fetcher.data?.ok && fetcher.data.intent === "create" ? fetcher.data : null;

  const actionError = fetcher.data && !fetcher.data.ok ? fetcher.data.error.message : null;

  if (createdApiKey) {
    return (
      <>
        <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
          Save your integration key
        </h1>

        <p className="mt-3 text-sm leading-6 text-black/50">
          Cascade will show this secret only once. Store it in your worker&apos;s secret manager
          before continuing.
        </p>

        <section
          aria-labelledby="activation-api-key-heading"
          className="mt-6 rounded-2xl border border-black/10 bg-white/70 p-4"
        >
          <h2 id="activation-api-key-heading" className="text-sm font-semibold text-[#05050c]">
            Integration key
          </h2>

          <code className="mt-3 block break-all rounded-xl bg-[#10140f] p-3 font-mono text-xs leading-5 text-white/85">
            {createdApiKey.token}
          </code>
        </section>

        <div className="mt-6 space-y-3">
          <GlassButton
            label="Copy API key"
            icon={Copy}
            onClick={() => {
              void navigator.clipboard.writeText(createdApiKey.token);
            }}
            tone="black"
            size="large"
            fullWidth
          />

          <GlassButton
            label={checking ? "Checking..." : "I saved the key"}
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

  return (
    <>
      <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
        Create an integration key
      </h1>

      <p className="mt-3 text-sm leading-6 text-black/50">
        Create a least-privilege key for registering deployments, triggering tasks, and reading run
        status.
      </p>

      <fetcher.Form method="post" action="/login" className="mt-8">
        <input type="hidden" name="intent" value="create_activation_key" />

        <label htmlFor="activation-key-name" className="text-sm font-medium text-black/65">
          Key name
        </label>

        <input
          id="activation-key-name"
          name="name"
          type="text"
          defaultValue="Cascade onboarding"
          required
          maxLength={120}
          autoComplete="off"
          className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white/70 px-4 text-sm text-[#05050c] outline-none transition focus:border-black/30 focus:bg-white"
        />

        <div className="mt-5 rounded-2xl border border-black/10 bg-white/45 p-4">
          <p className="text-xs font-semibold tracking-wide text-black/45 uppercase">
            Included permissions
          </p>

          <ul className="mt-3 space-y-2 text-sm text-black/60">
            <li>Register deployments</li>
            <li>Trigger tasks</li>
            <li>Read run status</li>
          </ul>
        </div>

        {actionError ? (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-red-900/10 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {actionError}
          </p>
        ) : null}

        <div className="mt-6">
          <GlassButton
            label={isCreating ? "Creating API key…" : "Create API key"}
            icon={ArrowRight}
            type="submit"
            disabled={isCreating}
            tone="black"
            size="large"
            fullWidth
          />
        </div>
      </fetcher.Form>
    </>
  );
}
