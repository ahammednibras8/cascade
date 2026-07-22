import { Link } from "react-router";
import { ArrowRight } from "~/components/icons";

export function meta() {
  return [
    { title: "Cascade Dashboard" },
    { name: "description", content: "Cascade task run dashboard" },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <p className="text-sm text-gray-500">Cascade</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-3 text-gray-600">Inspect durable task runs, attempts, logs, and output</p>

      <div className="mt-6">
        <Link
          to="/runs"
          className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          View task runs
          <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}
