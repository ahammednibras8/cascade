import { ArrowRight, BookOpen } from "lucide-react";
import GlassButton from "./GlassButton";
import StoneReveal from "./StoneReveal";

const ASSET_BASE = "/landing/synex";

export default function Hero() {
  return (
    <section
      className="relative h-dvh w-full overflow-hidden bg-[#f2f2f0]"
      style={{ fontFamily: '"Inter Tight", "Inter", system-ui, sans-serif' }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(220,220,215,0.6) 0%, rgba(220,220,215,0) 70%)",
        }}
      />

      <div className="absolute top-4 right-4 z-20 sm:top-6 sm:right-6">
        <GlassButton label="Continue" icon={ArrowRight} tone="black" to="/login" />
      </div>

      <div
        className="relative flex flex-col items-center px-6 pt-[clamp(4rem,12vh,8.75rem)] text-center"
        style={{ zIndex: 10 }}
      >
        <p className="mb-3 text-xs font-medium text-black/50 sm:mb-4 sm:text-[13px] md:text-sm">
          Durable Task Execution
        </p>

        <h2 className="text-[34px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[44px] md:text-[56px] lg:text-[68px]">
          <span className="block text-black/20">Background work,</span>
          <span className="block text-[#05050c]">built to survive.</span>
        </h2>

        <p className="mt-4 max-w-xl text-sm font-medium text-black/35 sm:mt-5 sm:text-base md:text-lg">
          Run background jobs, schedules, retries, and long-running operations as observable task
          runs you can inspect, cancel, and replay.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5 sm:mt-8 sm:gap-3">
          <GlassButton label="View docs" icon={BookOpen} />
        </div>
      </div>

      <StoneReveal
        side="left"
        baseSrc={`${ASSET_BASE}/stone-left.png`}
        grassSrc={`${ASSET_BASE}/stone-g-left.png`}
        zBase={1}
        zGrass={2}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center"
        style={{ zIndex: 3 }}
      >
        <div
          className="w-[92vw] sm:w-[72vw] md:w-[60vw] lg:w-[min(54vw,calc((100dvh-29.25rem)*1.845))]"
          style={{ maxWidth: "944px" }}
        >
          <img
            src={`${ASSET_BASE}/dashboard.png`}
            alt=""
            draggable={false}
            className="block h-auto w-full rounded-t-xl object-contain shadow-[0_-8px_80px_rgba(0,0,0,0.12),0_40px_120px_rgba(0,0,0,0.10)]"
          />
        </div>
      </div>

      <StoneReveal
        side="right"
        baseSrc={`${ASSET_BASE}/stone-right.png`}
        grassSrc={`${ASSET_BASE}/stone-g-right.png`}
        zBase={4}
        zGrass={5}
      />
    </section>
  );
}
