import AuthEntryPage from "~/components/auth/AuthEntryPage";

export function meta() {
  return [
    { title: "Sign up · Cascade" },
    { name: "description", content: "Create your Cascade account." },
  ];
}

export default function SignupPage() {
  return (
    <AuthEntryPage
      title="Create your account"
      description="Continue through your configured identity provider to start setting up Cascade."
      submitLabel="Continue to sign up"
      startHref="/auth/start?returnTo=%2Fonboarding"
      alternatePrompt="Already have an account?"
      alternateAction="Log in"
      alternateHref="/login"
    />
  );
}
