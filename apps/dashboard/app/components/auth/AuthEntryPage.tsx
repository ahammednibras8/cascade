import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import GlassButton from "~/components/landing/GlassButton";

type AuthStage = "authentication" | "workspace";

type AuthActionData = {
  error?: string;
  ok: boolean;
  stage?: AuthStage;
};

type AuthEntryPageProps = {
  authenticated: boolean;
  devAuthEnabled: boolean;
  error?: string | null;
  stage: AuthStage;
  startHref: string;
};

export default function AuthEntryPage({
  authenticated,
  devAuthEnabled,
  error,
  stage,
  startHref,
}: AuthEntryPageProps) {
  const shouldReduceMotion = useReducedMotion();
  const fetcher = useFetcher<AuthActionData>();
  const [currentStage, setCurrentStage] = useState<AuthStage>(stage);
  const [projectName, setProjectName] = useState("");

  const isAuthenticated = [authenticated, fetcher.data?.ok === true].includes(true);
  const workspaceStage = currentStage === "workspace";
  const authenticationPending = fetcher.state !== "idle";

  useEffect(() => {
    setCurrentStage(stage);
  }, [stage]);

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.stage) {
      setCurrentStage(fetcher.data.stage);
    }
  }, [fetcher.data]);

  return (
    <main className="flex min-h-dvh w-full bg-[#f2f2f0] p-2 lg:h-dvh lg:overflow-hidden lg:p-4">
      <section className="relative hidden h-full w-[52%] overflow-hidden rounded-[28px] bg-[#10140f] shadow-[0_28px_90px_rgba(0,0,0,0.2)] lg:block">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 28%, rgba(205,225,174,0.18), transparent 35%), linear-gradient(180deg, rgba(255,255,255,0.035), transparent 45%)",
          }}
        />
        <img
          src="/landing/synex/stone-g-left.png"
          alt=""
          className="pointer-events-none absolute -bottom-20 -left-40 w-[92%] max-w-none opacity-80"
        />
        <img
          src="/landing/synex/stone-g-right.png"
          alt=""
          className="pointer-events-none absolute -right-40 -bottom-24 w-[88%] max-w-none opacity-75"
        />

        <div className="absolute inset-0 z-10 flex items-center px-14 xl:px-16">
          <motion.ol
            aria-label="Setup progress"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="w-full space-y-8"
          >
            <Step
              number="01"
              label="Verify your identity"
              state={workspaceStage ? "complete" : "active"}
              onSelect={() => setCurrentStage("authentication")}
            />
            <Step
              number="02"
              label="Create a workspace"
              state={workspaceStage ? "active" : "pending"}
              {...(isAuthenticated ? { onSelect: () => setCurrentStage("workspace") } : {})}
            />
            <Step number="03" label="Run your first task" state="pending" />
          </motion.ol>
        </div>
      </section>

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
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-sm"
        >
          <p className="text-sm font-semibold tracking-[-0.01em] text-[#05050c]">Cascade</p>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStage}
              initial={shouldReduceMotion ? false : { opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              {...(shouldReduceMotion ? {} : { exit: { opacity: 0, x: -10 } })}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              {workspaceStage ? (
                <WorkspaceState
                  projectName={projectName}
                  onBack={() => setCurrentStage("authentication")}
                  onProjectNameChange={setProjectName}
                />
              ) : (
                <AuthenticationState
                  authenticated={isAuthenticated}
                  authenticationPending={authenticationPending}
                  devAuthEnabled={devAuthEnabled}
                  error={error ?? fetcher.data?.error}
                  fetcher={fetcher}
                  onContinue={() => setCurrentStage("workspace")}
                  startHref={startHref}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </section>
    </main>
  );
}

function AuthenticationState({
  authenticated,
  authenticationPending,
  devAuthEnabled,
  error,
  fetcher,
  onContinue,
  startHref,
}: {
  authenticated: boolean;
  authenticationPending: boolean;
  devAuthEnabled: boolean;
  error: string | null | undefined;
  fetcher: ReturnType<typeof useFetcher<AuthActionData>>;
  onContinue: () => void;
  startHref: string;
}) {
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
          Authentication failed. Please try again.
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

function WorkspaceState({
  projectName,
  onBack,
  onProjectNameChange,
}: {
  projectName: string;
  onBack: () => void;
  onProjectNameChange: (value: string) => void;
}) {
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

      <div className="mt-8">
        <label htmlFor="project-name" className="text-sm font-medium text-black/65">
          Project name
        </label>
        <input
          id="project-name"
          name="projectName"
          type="text"
          autoComplete="off"
          value={projectName}
          onChange={(event) => onProjectNameChange(event.target.value)}
          className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white/70 px-4 text-sm text-[#05050c] outline-none transition focus:border-black/30 focus:bg-white"
        />
      </div>
    </>
  );
}

function Step({
  number,
  label,
  onSelect,
  state,
}: {
  number: string;
  label: string;
  onSelect?: () => void;
  state: "active" | "complete" | "pending";
}) {
  const active = state === "active";
  const selectable = onSelect !== undefined && !active;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={!selectable}
        aria-current={active ? "step" : undefined}
        className={`flex w-full items-center gap-4 text-left text-sm transition-colors ${
          active
            ? "text-white"
            : state === "complete"
              ? "cursor-pointer text-white/65 hover:text-white"
              : selectable
                ? "cursor-pointer text-white/40 hover:text-white/70"
                : "cursor-default text-white/40"
        }`}
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
            active ? "border-white/70 bg-white text-[#10140f]" : "border-white/15 bg-black/20"
          }`}
        >
          {number}
        </span>
        <span className="font-medium">{label}</span>
      </button>
    </li>
  );
}
