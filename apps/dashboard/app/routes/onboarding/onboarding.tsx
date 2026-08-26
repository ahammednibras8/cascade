import type { Route } from "./+types/onboarding";
import { requireDashboardUser } from "~/lib/auth/dashboard-auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireDashboardUser(request);

  return null;
}

export function meta() {
  return [
    { title: "Onboarding · Cascade" },
    { name: "description", content: "Set up your Cascade development workspace." },
  ];
}

export default function Onboarding() {
  return (
    <main>
      <h1>Onboarding</h1>
    </main>
  );
}
