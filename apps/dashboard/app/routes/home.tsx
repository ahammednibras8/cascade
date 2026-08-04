import { Link } from "react-router";
import { ArrowRight } from "~/components/icons";

export function meta() {
  return [
    { title: "Cascade Dashboard" },
    { name: "description", content: "Cascade task dashboard" },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <p className="text-sm text-gray-500">Cascade</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Dashboard</h1>

      <p className="mt-3 text-gray-600">Inspect registered tasks and durable task runs.</p>

      <div className="mt-6 flex gap-3">
        <Link
          to="/tasks"
          className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          View tasks
          <ArrowRight size={15} />
        </Link>

        <Link
          to="/runs"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          View task runs
          <ArrowRight size={15} />
        </Link>

        <Link
          to="/api-keys"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          Manage API keys
          <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}
