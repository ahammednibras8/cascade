import AuthEntryPage from "~/components/auth/AuthEntryPage";

export function meta() {
  return [{ title: "Sign in · Cascade" }, { name: "description", content: "Sign in to Cascade." }];
}

export default function SignupPage() {
  return <AuthEntryPage title="Sign in" startHref="/auth/start?returnTo=%2Fonboarding" />;
}
