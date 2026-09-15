import { ArrowLeft, ArrowRight } from "lucide-react";
import type { useFetcher } from "react-router";
import GlassButton from "~/components/landing/GlassButton";
import type { DashboardUserIdentitySummary } from "~/lib/auth/dashboard-user.server";
import type { AuthActionData } from "./AuthEntryPage";

export default function AuthenticationState({
  authenticated,
  authenticationPending,
  devAuthEnabled,
  error,
  fetcher,
  identity,
  onContinue,
  selectAccountHref,
  startHref,
}: {
  authenticated: boolean;
  authenticationPending: boolean;
  devAuthEnabled: boolean;
  error: string | null | undefined;
  fetcher: ReturnType<typeof useFetcher<AuthActionData>>;
  onContinue: () => void;
  startHref: string;
  identity: DashboardUserIdentitySummary | null;
  selectAccountHref: string;
}) {
  if (authenticated) {
    const accountName = identity?.displayName ?? identity?.email ?? "Verified account";
    const accountEmail = identity?.email ?? "Your authenticated session is active.";

    return (
      <>
        <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
          Identity verified
        </h1>

        <p className="mt-3 text-sm leading-6 text-black/50">
          You are securely signed in. Continuing setup will not require authentication again.
        </p>

        <div className="mt-7 flex items-center gap-4 rounded-2xl border border-black/8 bg-white/65 p-4 shadow-sm">
          <div
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#dbe5cf] text-sm font-semibold uppercase text-[#24301c]"
          >
            {accountName.slice(0, 1)}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#05050c]">{accountName}</p>
            <p className="mt-0.5 truncate text-xs text-black/45">{accountEmail}</p>
          </div>

          <span className="rounded-full bg-[#e1ead7] px-2.5 py-1 text-[11px] font-semibold text-[#334526]">
            Verified
          </span>
        </div>

        <div className="mt-8 space-y-3">
          <GlassButton
            label="Return to setup"
            icon={ArrowRight}
            onClick={onContinue}
            tone="black"
            size="large"
            fullWidth
          />

          <GlassButton
            label="Use another account"
            icon={ArrowLeft}
            href={selectAccountHref}
            tone="glass"
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
        Sign in
      </h1>
      <p className="mt-3 text-sm leading-6 text-black/50">
        Use your organization account to continue.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-2xl border border-red-900/10 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-8">
        {authenticated ? (
          <GlassButton
            label="Continue"
            icon={ArrowRight}
            onClick={onContinue}
            tone="black"
            size="large"
            fullWidth
          />
        ) : devAuthEnabled ? (
          <fetcher.Form method="post" action="/login">
            <input type="hidden" name="intent" value="authenticate" />
            <GlassButton
              label={authenticationPending ? "Continuing…" : "Continue with SSO"}
              icon={ArrowRight}
              type="submit"
              disabled={authenticationPending}
              tone="black"
              size="large"
              fullWidth
            />
          </fetcher.Form>
        ) : (
          <GlassButton
            label="Continue with SSO"
            icon={ArrowRight}
            href={startHref}
            tone="black"
            size="large"
            fullWidth
          />
        )}
      </div>

      <p className="mt-5 text-sm leading-6 text-black/40">
        New to Cascade? Your account is created after your first sign-in.
      </p>
    </>
  );
}
