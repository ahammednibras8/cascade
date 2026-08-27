import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import GlassButton from "~/components/landing/GlassButton";

type AuthEntryPageProps = {
  error?: string | null;
  startHref: string;
  title: string;
};

export default function AuthEntryPage({ error, startHref, title }: AuthEntryPageProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <main className="flex min-h-dvh w-full bg-[#f2f2f0] p-2 lg:h-dvh lg:overflow-hidden lg:p-4">
      <section
        aria-hidden="true"
        className="relative hidden h-full w-[52%] overflow-hidden rounded-[28px] bg-[#10140f] shadow-[0_28px_90px_rgba(0,0,0,0.2)] lg:block"
      >
        <div
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
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="w-full space-y-8"
          >
            <Step number="01" label="Verify your identity" active />
            <Step number="02" label="Create a workspace" />
            <Step number="03" label="Run your first task" />
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

          <h1 className="mt-14 text-4xl leading-tight font-medium tracking-[-0.035em] text-[#05050c]">
            {title}
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
            <GlassButton
              label="Continue with SSO"
              icon={ArrowRight}
              href={startHref}
              tone="black"
              size="large"
              fullWidth
            />
          </div>

          <p className="mt-5 text-sm leading-6 text-black/40">
            New to Cascade? Your account is created after your first sign-in.
          </p>
        </motion.div>
      </section>
    </main>
  );
}

function Step({
  number,
  label,
  active = false,
}: {
  number: string;
  label: string;
  active?: boolean;
}) {
  return (
    <li className={`flex items-center gap-4 text-sm ${active ? "text-white" : "text-white/40"}`}>
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
          active ? "border-white/70 bg-white text-[#10140f]" : "border-white/15 bg-black/20"
        }`}
      >
        {number}
      </span>
      <span className="font-medium">{label}</span>
    </li>
  );
}
