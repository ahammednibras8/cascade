import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import GlassButton from "~/components/landing/GlassButton";
import type { PendingDashboardActivationState } from "~/lib/activation/activation-state";
import ActivationState from "./ActivationState";
import SetupProgress from "./SetupProgress";
import { getDurableProgressStage, type AuthStage } from "./setup-progress";
import type { DashboardUserIdentitySummary } from "~/lib/auth/dashboard-user.server";
import AuthenticationState from "./AuthenticationState";

export type AuthActionData = {
  activationState?: PendingDashboardActivationState;
  error?: string;
  ok: boolean;
  stage?: AuthStage;
  redirectTo?: string;
  identity?: DashboardUserIdentitySummary;
};

type AuthEntryPageProps = {
  activationState: PendingDashboardActivationState | null;
  authenticated: boolean;
  devAuthEnabled: boolean;
  error?: string | null;
  stage: AuthStage;
  startHref: string;
  returnTo: string;
  identity: DashboardUserIdentitySummary | null;
  selectAccountHref: string;
  progressStage: AuthStage;
};

function getCurrentActivationState(
  actionState: PendingDashboardActivationState | undefined,
  loaderState: PendingDashboardActivationState | null,
) {
  return actionState ?? loaderState;
}

function getCurrentProgressStage(actionStage: AuthStage | undefined, loaderStage: AuthStage) {
  return actionStage ?? loaderStage;
}

function useActivationRedirect(actionData: AuthActionData | undefined) {
  const navigate = useNavigate();
  const redirectTo = actionData?.redirectTo;

  useEffect(() => {
    if (redirectTo) {
      void navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo]);
}

function isActivationRefreshPending(state: string, formData: FormData | undefined) {
  return state !== "idle" && formData?.get("intent") === "refresh_activation";
}

function useOnboardingViewPersistence(enabled: boolean) {
  const fetcher = useFetcher();

  return (displayedStep: AuthStage) => {
    if (!enabled) {
      return;
    }

    void fetcher.submit(
      {
        intent: "update_displayed_step",
        displayedStep,
      },
      {
        action: "/login",
        method: "post",
      },
    );
  };
}

export default function AuthEntryPage({
  activationState,
  authenticated,
  devAuthEnabled,
  error,
  identity,
  returnTo,
  selectAccountHref,
  stage,
  startHref,
  progressStage: loaderProgressStage,
}: AuthEntryPageProps) {
  const shouldReduceMotion = useReducedMotion();
  const fetcher = useFetcher<AuthActionData>();
  const [viewStage, setViewStage] = useState<AuthStage>(stage);

  useActivationRedirect(fetcher.data);

  const currentActivationState = getCurrentActivationState(
    fetcher.data?.activationState,
    activationState,
  );
  const persistOnboardingView = useOnboardingViewPersistence(currentActivationState !== null);
  const currentIdentity = fetcher.data?.identity ?? identity;
  const activationStage = viewStage === "activation" ? currentActivationState : null;

  const isAuthenticated = [authenticated, fetcher.data?.ok === true].includes(true);
  const progressStage = getDurableProgressStage({
    hasPersistedSession: isAuthenticated,
    loaderStage: getCurrentProgressStage(fetcher.data?.stage, loaderProgressStage),
  });
  const workspaceStage = viewStage === "workspace";
  const activationRefreshPending = isActivationRefreshPending(fetcher.state, fetcher.formData);
  const authenticationPending = fetcher.state !== "idle";

  const authenticationError =
    error ??
    (fetcher.data?.error ? "Authentication is currently unavailable. Please try again." : null);

  function changeViewStage(nextStage: AuthStage) {
    setViewStage(nextStage);
    persistOnboardingView(nextStage);
  }

  useEffect(() => {
    setViewStage(stage);
  }, [stage]);

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.stage) {
      setViewStage(fetcher.data.stage);
    }
  }, [fetcher.data]);

  return (
    <main className="flex min-h-dvh w-full bg-[#f2f2f0] p-2 lg:h-dvh lg:overflow-hidden lg:p-4">
      <SetupProgress
        progressStage={progressStage}
        viewStage={viewStage}
        onStageChange={changeViewStage}
        shouldReduceMotion={shouldReduceMotion}
      />

      <section className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-12 sm:px-12 lg:px-16 xl:px-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            background:
              "radial-gradient(circle at 50% 18%, rgba(192,205,175,0.24), transparent 38%)",
          }}
        />

        <motion.div
          initial={getMotionInitial(shouldReduceMotion, {
            opacity: 0,
            y: 12,
            filter: "blur(6px)",
          })}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-sm"
        >
          <p className="text-sm font-semibold tracking-[-0.01em] text-[#05050c]">Cascade</p>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={viewStage}
              initial={getMotionInitial(shouldReduceMotion, {
                opacity: 0,
                x: 14,
              })}
              animate={{ opacity: 1, x: 0 }}
              {...getMotionExit(shouldReduceMotion)}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              {activationStage ? (
                <ActivationState
                  activationState={activationStage}
                  checking={activationRefreshPending}
                  returnTo={returnTo}
                  onCheck={() => {
                    void fetcher.submit(
                      {
                        intent: "refresh_activation",
                        returnTo,
                      },
                      {
                        action: "/login",
                        method: "post",
                      },
                    );
                  }}
                />
              ) : workspaceStage ? (
                <WorkspaceState
                  completed={progressStage === "activation"}
                  fetcher={fetcher}
                  onBack={() => changeViewStage("authentication")}
                  onContinue={() => changeViewStage("activation")}
                />
              ) : (
                <AuthenticationState
                  authenticated={isAuthenticated}
                  authenticationPending={authenticationPending}
                  devAuthEnabled={devAuthEnabled}
                  error={authenticationError}
                  fetcher={fetcher}
                  onContinue={() => changeViewStage(progressStage)}
                  startHref={startHref}
                  identity={currentIdentity}
                  selectAccountHref={selectAccountHref}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </section>
    </main>
  );
}

function getMotionInitial<T>(shouldReduceMotion: boolean | null, initial: T) {
  return shouldReduceMotion ? false : initial;
}

function getMotionExit(shouldReduceMotion: boolean | null) {
  return shouldReduceMotion ? {} : { exit: { opacity: 0, x: -10 } };
}

function WorkspaceState({
  completed,
  fetcher,
  onBack,
  onContinue,
}: {
  completed: boolean;
  fetcher: ReturnType<typeof useFetcher<AuthActionData>>;
  onBack: () => void;
  onContinue: () => void;
}) {
  const workspacePending =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "create_workspace";

  if (completed) {
    return (
      <>
        <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
          Workspace created
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/50">
          Your workspace is saved. Continue to finish activation.
        </p>
        <div className="mt-8">
          <GlassButton
            label="Return to activation"
            icon={ArrowRight}
            onClick={onContinue}
            tone="black"
            size="large"
            fullWidth
          />
        </div>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-black/45 transition-colors hover:text-black"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to sign in
      </button>

      <h1 className="mt-8 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
        Create a workspace
      </h1>
      <p className="mt-3 text-sm leading-6 text-black/50">
        Name the project you want to use with Cascade.
      </p>

      <fetcher.Form method="post" action="/login" className="mt-8">
        <input type="hidden" name="intent" value="create_workspace" />

        <label htmlFor="project-name" className="text-sm font-medium text-black/65">
          Project name
        </label>
        <input
          id="project-name"
          name="projectName"
          type="text"
          autoComplete="organization"
          required
          className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white/70 px-4 text-sm text-[#05050c] outline-none transition focus:border-black/30 focus:bg-white"
        />

        <div className="mt-6">
          <GlassButton
            label={workspacePending ? "Creating workspace..." : "Create workspace"}
            icon={ArrowRight}
            type="submit"
            disabled={workspacePending}
            tone="black"
            size="large"
            fullWidth
          />
        </div>
      </fetcher.Form>
    </>
  );
}
