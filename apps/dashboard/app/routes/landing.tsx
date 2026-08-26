import Hero from "~/components/landing/Hero";

export function meta() {
  return [
    { title: "Cascade — Durable Task Execution" },
    {
      name: "description",
      content:
        "Run background jobs, schedules, retries, and long-running operations as durable, observable task runs.",
    },
  ];
}

export default function Landing() {
  return (
    <main className="h-dvh overflow-hidden">
      <h1 className="sr-only">Durable tasks you can inspect, replay, and trust.</h1>
      <Hero />
    </main>
  );
}
