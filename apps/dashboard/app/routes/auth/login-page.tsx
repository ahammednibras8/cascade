import AuthEntryPage from "~/components/auth/AuthEntryPage";
import type { Route } from "./+types/login-page";

function normalizeReturnTo(value: string | null) {
  if (value?.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/dashboard";
}

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);

  return {
    error: url.searchParams.get("error"),
    returnTo: normalizeReturnTo(url.searchParams.get("returnTo")),
  };
}

export function meta() {
  return [{ title: "Sign in · Cascade" }, { name: "description", content: "Sign in to Cascade." }];
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const startHref = `/auth/start?returnTo=${encodeURIComponent(loaderData.returnTo)}`;

  return <AuthEntryPage title="Sign in" startHref={startHref} error={loaderData.error} />;
}
