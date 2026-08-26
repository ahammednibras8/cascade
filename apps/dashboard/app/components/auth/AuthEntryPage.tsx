import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "react-router";

type AuthEntryPageProps = {
  alternateAction: string;
  alternateHref: string;
  alternatePrompt: string;
  description: string;
  error?: string | null;
  startHref: string;
  submitLabel: string;
  title: string;
};

export default function AuthEntryPage({
  alternateAction,
  alternateHref,
  alternatePrompt,
  description,
  error,
  startHref,
  submitLabel,
  title,
}: AuthEntryPageProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f2f2f0] px-6 py-12">
      <section className="w-full max-w-sm rounded-3xl border border-black/10 bg-white/75 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.1)] backdrop-blur-xl sm:p-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-black/50 transition-colors hover:text-black"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Cascade
        </Link>

        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.03em] text-[#05050c]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-black/55">{description}</p>

        {error ? (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Authentication failed. Please try again.
          </p>
        ) : null}

        <a
          href={startHref}
          className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#05050c] px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:translate-y-0"
        >
          {submitLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </a>

        <p className="mt-6 text-center text-sm text-black/50">
          {alternatePrompt}{" "}
          <Link to={alternateHref} className="font-semibold text-black hover:underline">
            {alternateAction}
          </Link>
        </p>
      </section>
    </main>
  );
}
