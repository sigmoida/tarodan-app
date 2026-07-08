'use client';

import ErrorState from '@/components/feedback/ErrorState';
import './globals.css';

/**
 * Kicks in when the root layout itself errors — renders its own `<html>`/`<body>`
 * tree and pulls in globals.css (otherwise tokens won't load), then reuses the
 * shared {@link ErrorState} so recovery looks identical to every other boundary.
 */
export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<html lang='tr'>
			<body>
				<ErrorState
					error={error}
					reset={reset}
					fullScreen
					description='Uygulama beklenmeyen bir hatayla karşılaştı. Yeniden denemeyi deneyin.'
				/>
			</body>
		</html>
	);
}
