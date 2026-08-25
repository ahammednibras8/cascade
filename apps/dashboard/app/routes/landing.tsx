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
    <main className="min-h-dvh overflow-hidden bg-slate-950 text-white">
      <section
        aria-labelledby="landing-heading"
        className="mx-auto flex min-h-dvh max-w-7xl flex-col justify-center px-6 py-12 sm:px-10 lg:px-16"
      >
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

        <div aria-hidden="true" className="mt-10 h-11 max-w-sm" />
      </section>
    </main>
  );
}
