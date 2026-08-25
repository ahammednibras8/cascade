import type { Route } from "./+types/landing";

export function meta() {
  return [
    { title: "Cascade" },
    {
      name: "description",
      content: "Durable task execution for background work you can inspect, replay, and trust.",
    },
  ];
}

export default function Landing(_props: Route.ComponentProps) {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-[#050914] text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_70%_45%,rgba(8,145,178,0.16),transparent_32%),radial-gradient(circle_at_20%_82%,rgba(30,64,175,0.12),transparent_28%)]"
      />

      <section
        aria-labelledby="landing-heading"
        className="relative mx-auto grid min-h-dvh max-w-7xl items-center gap-12 px-6 py-12 sm:px-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:px-16"
      >
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-cyan-300">CASCADE</p>

          <h1
            id="landing-heading"
            className="mt-6 max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl"
          >
            Durable tasks you can inspect, replay, and trust.
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Cascade turns background jobs, schedules, retries, and long-running work into observable
            task runs with deployment-aware execution and an operator dashboard.
          </p>

          <div aria-hidden="true" className="mt-10 h-11 w-48" />
        </div>

        <div
          aria-hidden="true"
          className="relative hidden min-h-[420px] overflow-hidden rounded-[2rem] border border-cyan-200/10 bg-[#07111f]/70 shadow-[0_0_80px_rgba(8,145,178,0.08)] lg:block"
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.045)_1px,transparent_1px)] bg-[size:28px_28px]" />
          <div className="absolute -right-24 top-8 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="absolute inset-[10%] [transform:perspective(1000px)_rotateY(-9deg)_rotateX(4deg)]">
            <div className="absolute inset-0 rounded-[1.5rem] border border-cyan-100/10 bg-[#06101d]/80 shadow-[0_24px_60px_rgba(0,0,0,0.35)]" />

            <svg
              viewBox="0 0 600 420"
              className="absolute inset-0 h-full w-full"
              fill="none"
              preserveAspectRatio="none"
            >
              <path
                d="M104 132C170 112 190 88 254 88"
                stroke="rgba(34,211,238,0.65)"
                strokeDasharray="7 9"
                strokeWidth="1.5"
              />
              <path
                d="M325 105C382 128 414 158 430 205"
                stroke="rgba(34,211,238,0.65)"
                strokeDasharray="7 9"
                strokeWidth="1.5"
              />
              <path
                d="M420 248C388 296 352 324 302 337"
                stroke="rgba(74,222,128,0.72)"
                strokeDasharray="7 9"
                strokeWidth="1.5"
              />
              <path
                d="M274 318C215 290 178 244 164 190"
                stroke="rgba(96,165,250,0.45)"
                strokeDasharray="7 9"
                strokeWidth="1.5"
              />
              <circle cx="296" cy="211" r="92" stroke="rgba(34,211,238,0.12)" />
              <circle cx="296" cy="211" r="124" stroke="rgba(34,211,238,0.07)" />
            </svg>

            <div className="absolute left-[7%] top-[24%] rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-cyan-200">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgb(103_232_249)]" />
              TRIGGER
            </div>

            <div className="absolute left-[38%] top-[12%] rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-sky-200">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_12px_rgb(125_211_252)]" />
              QUEUE
            </div>

            <div className="absolute right-[7%] top-[42%] rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-blue-200">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-blue-300 shadow-[0_0_12px_rgb(147_197_253)]" />
              WORKER
            </div>

            <div className="absolute bottom-[12%] left-[40%] rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-emerald-200">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgb(110_231_183)]" />
              COMPLETE
            </div>

            <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-cyan-200/30 bg-[#071a2b] shadow-[0_0_0_10px_rgba(34,211,238,0.05),0_0_45px_rgba(34,211,238,0.2)]">
              <span className="text-[10px] font-semibold tracking-[0.22em] text-cyan-200">RUN</span>
              <span className="mt-1 text-xl font-semibold tracking-tight text-white">#042</span>
              <span className="mt-1 text-[9px] font-medium tracking-[0.14em] text-slate-400">
                DURABLE
              </span>
            </div>

            <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between border-t border-cyan-100/10 pt-3 text-[10px] font-medium tracking-[0.14em] text-slate-500">
              <span>ATTEMPTS 02</span>
              <span>EVENTS 14</span>
              <span className="text-emerald-300">PERSISTED</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
