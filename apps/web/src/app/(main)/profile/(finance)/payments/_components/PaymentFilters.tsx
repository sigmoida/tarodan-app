/** @format */

'use client';

import { Button, Input, Select } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import type { PaymentFilterState } from '../_lib/types';

interface Props {
	filters: PaymentFilterState;
	onChange: (key: keyof PaymentFilterState, value: string) => void;
	onClear: () => void;
}

export default function PaymentFilters({ filters, onChange, onClear }: Props) {
	const { t, locale } = useTranslation();

	return (
		<div className='rounded-lg border border-border bg-surface-elevated p-4'>
			<div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
				<label className='block'>
					<span className='mb-2 block text-sm font-medium text-body'>
						{t('common.status')}
					</span>
					<Select
						value={filters.status}
						onChange={(e) => onChange('status', e.target.value)}>
						<option value=''>{t('common.all')}</option>
						<option value='pending'>{locale === 'en' ? 'Pending' : 'Bekliyor'}</option>
						<option value='processing'>{locale === 'en' ? 'Processing' : 'İşleniyor'}</option>
						<option value='completed'>{locale === 'en' ? 'Completed' : 'Tamamlandı'}</option>
						<option value='failed'>{locale === 'en' ? 'Failed' : 'Başarısız'}</option>
						<option value='refunded'>{locale === 'en' ? 'Refunded' : 'İade Edildi'}</option>
					</Select>
				</label>

				<label className='block'>
					<span className='mb-2 block text-sm font-medium text-body'>
						{t('payment.provider')}
					</span>
					<Select
						value={filters.provider}
						onChange={(e) => onChange('provider', e.target.value)}>
						<option value=''>{t('common.all')}</option>
						<option value='paytr'>PayTR</option>
					</Select>
				</label>

				<label className='block'>
					<span className='mb-2 block text-sm font-medium text-body'>
						{t('payment.startDate')}
					</span>
					<Input
						type='date'
						value={filters.startDate}
						onChange={(e) => onChange('startDate', e.target.value)}
					/>
				</label>

				<label className='block'>
					<span className='mb-2 block text-sm font-medium text-body'>
						{t('payment.endDate')}
					</span>
					<Input
						type='date'
						value={filters.endDate}
						onChange={(e) => onChange('endDate', e.target.value)}
					/>
				</label>
			</div>

			<div className='mt-4 flex justify-end'>
				<Button variant='ghost' size='sm' onClick={onClear}>
					{t('product.clearFilters')}
				</Button>
			</div>
		</div>
	);
}
