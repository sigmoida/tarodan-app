'use client';

import ErrorState from '@/components/feedback/ErrorState';

/**
 * Root segment-level error boundary. Catches route render/data errors from any
 * segment that has no closer `error.tsx`; `reset()` retries. Errors in the root
 * layout itself are handled by `global-error.tsx`. Renders the shared
 * {@link ErrorState} full-screen (no chrome around this boundary).
 */
export default function Error({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return <ErrorState error={error} reset={reset} fullScreen />;
}
