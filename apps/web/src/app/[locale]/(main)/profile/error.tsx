"use client";

import ErrorState from "@/components/feedback/ErrorState";

/**
 * Account-area error boundary. Renders inside `ProfileShell`, so the account
 * sidebar stays and the error is contained to the main column. Catches errors
 * from any `/profile/*` page; errors in the profile layout itself (e.g. the
 * `getSession()` gate) bubble up to the storefront `(main)/error.tsx`.
 */
export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState error={error} reset={reset} />;
}
