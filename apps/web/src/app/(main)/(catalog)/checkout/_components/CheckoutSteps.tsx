/** @format */

'use client';

import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

/** The 1-2-3 progress indicator at the top of the checkout flow. */
export default function CheckoutSteps({ step }: { step: number }) {
	const { t } = useTranslation();
	const steps = [
		{ step: 1, label: t('checkout.step1') },
		{ step: 2, label: t('checkout.step2') },
		{ step: 3, label: t('checkout.step3') },
	];

	return (
		<div className='flex items-center justify-center gap-4 mb-8'>
			{steps.map((s, index) => (
				<div key={s.step} className='flex items-center'>
					<div
						className={`w-10 h-10 rounded-sm flex items-center justify-center font-semibold transition-colors ${
							step >= s.step
								? 'bg-primary-500 text-inverted'
								: 'bg-border-subtle text-muted'
						}`}>
						{step > s.step ? <CheckCircleIcon className='w-6 h-6' /> : s.step}
					</div>
					<span
						className={`ml-2 ${step >= s.step ? 'text-heading' : 'text-muted'}`}>
						{s.label}
					</span>
					{index < 2 && (
						<div
							className={`w-16 h-1 mx-4 ${step > s.step ? 'bg-primary-500' : 'bg-border-subtle'}`}
						/>
					)}
				</div>
			))}
		</div>
	);
}
