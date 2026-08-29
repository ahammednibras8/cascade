import { motion } from "framer-motion";

type AuthStage = "authentication" | "workspace" | "activation";

export default function SetupProgress({
  currentStage,
  isAuthenticated,
  onStageChange,
  shouldReduceMotion,
}: {
  currentStage: AuthStage;
  isAuthenticated: boolean;
  onStageChange: (stage: AuthStage) => void;
  shouldReduceMotion: boolean | null;
}) {
  const workspaceStage = currentStage === "workspace";

  return (
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
            onSelect={() => onStageChange("authentication")}
          />
          <Step
            number="02"
            label="Create a workspace"
            state={workspaceStage ? "active" : "pending"}
            {...(isAuthenticated ? { onSelect: () => onStageChange("workspace") } : {})}
          />
          <Step
            number="03"
            label="Run your first task"
            state={currentStage === "activation" ? "active" : "pending"}
          />
        </motion.ol>
      </div>
    </section>
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
