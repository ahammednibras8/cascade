import AuthEntryPage from "~/components/auth/AuthEntryPage";

export function meta() {
  return [{ title: "Sign in · Cascade" }, { name: "description", content: "Sign in to Cascade." }];
}

export default function SignupPage() {
  return (
    <AuthEntryPage
      authenticated={false}
      devAuthEnabled={false}
      stage="authentication"
      startHref="/auth/start"
    />
  );
}
