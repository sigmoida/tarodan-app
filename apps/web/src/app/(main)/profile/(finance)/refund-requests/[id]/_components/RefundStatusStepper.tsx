/** @format */

'use client';

import { Stepper, type StepperStep } from '@tarodan/ui';
import {
	REFUND_LIFECYCLE,
	refundStatusPhase,
	refundTerminalStatuses,
} from '../../_lib/refundStatus';

/**
 * Horizontal stepper showing which phase the refund is in — built on the shared
 * `@tarodan/ui` Stepper (same component the checkout wizard uses), mirroring the
 * admin refund detail. Terminal states render a red ✕ end-cap.
 */
export default function RefundStatusStepper({
	status,
	locale,
}: {
	status: string;
	locale: string;
}) {
	let steps: StepperStep[];
	let current: number;

	if (refundTerminalStatuses.has(status)) {
		const endLabel =
			status === 'rejected'
				? locale === 'en'
					? 'Rejected'
					: 'Reddedildi'
				: locale === 'en'
					? 'Cancelled'
					: 'İptal edildi';
		steps = [
			{ label: locale === 'en' ? 'Request received' : 'Talep alındı' },
			{ label: endLabel, error: true },
		];
		current = 1;
	} else {
		steps = REFUND_LIFECYCLE.map((p) => ({ label: locale === 'en' ? p.en : p.tr }));
		current = refundStatusPhase[status] ?? 0;
	}

	return (
		<div className='rounded-lg border border-border bg-surface-elevated p-4 sm:p-6'>
			<Stepper steps={steps} current={current} />
		</div>
	);
}
