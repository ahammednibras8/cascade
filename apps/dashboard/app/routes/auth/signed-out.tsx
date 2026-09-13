import { Link } from "react-router";

export function meta() {
  return [
    { title: "Signed out · Cascade Dashboard" },
    { name: "description", content: "You have signed out of Cascade Dashboard" },
  ];
}

export default function SignedOut() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <p className="text-sm text-gray-500">Cascade</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Signed out</h1>
      <p className="mt-3 text-gray-600">Your dashboard session has been cleared.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/login"
          className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Sign in again
        </Link>

        <Link
          to="/auth/start?selectAccount=true"
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          Use another account
        </Link>
      </div>
    </main>
  );
}
