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

      <Link
        to="/login"
        className="mt-6 inline-flex w-fit items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
      >
        Sign in again
      </Link>
    </main>
  );
}
