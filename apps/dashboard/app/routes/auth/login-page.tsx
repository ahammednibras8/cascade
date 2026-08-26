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
  return [
    { title: "Log in · Cascade" },
    { name: "description", content: "Log in to your Cascade account." },
  ];
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const startHref = `/auth/start?returnTo=${encodeURIComponent(loaderData.returnTo)}`;

  return (
    <AuthEntryPage
      title="Welcome back"
      description="Continue through your configured identity provider to access Cascade."
      submitLabel="Continue to log in"
      startHref={startHref}
      alternatePrompt="New to Cascade?"
      alternateAction="Create an account"
      alternateHref="/signup"
      error={loaderData.error}
    />
  );
}
