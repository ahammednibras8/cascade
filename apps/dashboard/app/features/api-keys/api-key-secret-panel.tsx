import type { RevealedApiKey } from "./types";

type ApiKeySecretPanelProps = {
  apiKey: RevealedApiKey;
  onDismiss: () => void;
};

export function ApiKeySecretPanel({ apiKey, onDismiss }: ApiKeySecretPanelProps) {
  return (
    <section
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4"
      aria-labelledby="new-api-key-heading"
    >
      <h2 id="new-api-key-heading" className="font-semibold text-amber-950">
        Copy this API key now
      </h2>

      <p className="mt-1 text-sm text-amber-900">
        This is the only time Cascade will show the secret for {apiKey.name}.
      </p>

      <code className="mt-3 block break-all rounded bg-white p-3 font-mono text-sm text-gray-950">
        {apiKey.token}
      </code>

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(apiKey.token)}
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white"
        >
          Copy API key
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
        >
          I copied it
        </button>
      </div>
    </section>
  );
}
