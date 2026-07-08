'use client';

import ErrorState from '@/components/feedback/ErrorState';

/**
 * Storefront error boundary. Renders INSIDE the `(main)` layout, so the header,
 * category bar and footer stay put and the error shows in the content area —
 * unlike the root boundary which replaces the whole screen. Catches render/data
 * errors from any public marketplace page (and the profile layout's own errors,
 * which bubble up past `profile/error.tsx`).
 */
export default function MainError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return <ErrorState error={error} reset={reset} />;
}
