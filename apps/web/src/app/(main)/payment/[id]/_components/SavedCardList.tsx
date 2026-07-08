/** @format */

'use client';

import { CreditCardIcon, PlusIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Radio, CvvInput } from '@tarodan/ui';
import type { SavedCard } from '@/lib/api';
import { NEW_CARD, brandFromLabel } from '../_lib/card';
import { BrandBadge, MastercardMark } from './CardVisuals';

interface SavedCardListProps {
	cards: SavedCard[];
	selected: string;
	onSelect: (id: string) => void;
	savedCvv: string;
	onSavedCvvChange: (v: string) => void;
}

const rowCls = (active: boolean) =>
	`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer transition ${
		active
			? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200'
			: 'border-border hover:border-primary-300 hover:bg-surface'
	}`;

export default function SavedCardList({
	cards,
	selected,
	onSelect,
	savedCvv,
	onSavedCvvChange,
}: SavedCardListProps) {
	return (
		<>
			{cards.map((c) => {
				const active = selected === c.id;
				const cBrand = brandFromLabel(c.brand);
				return (
					<label key={c.id} className={rowCls(active)}>
						<Radio name='savedcard' checked={active} onChange={() => onSelect(c.id)} />
						<span className='inline-flex h-8 w-12 items-center justify-center rounded-md bg-gradient-to-br from-slate-700 to-slate-900 text-white'>
							{cBrand === 'mastercard' ? (
								<MastercardMark />
							) : cBrand !== 'unknown' ? (
								<BrandBadge brand={cBrand} />
							) : (
								<CreditCardIcon className='h-4 w-4' />
							)}
						</span>
						<span className='font-medium tracking-wide text-heading tabular-nums'>•••• {c.last4}</span>
						{c.expMonth && c.expYear && (
							<span className='text-sm text-muted tabular-nums'>
								{c.expMonth}/{c.expYear}
							</span>
						)}
						{active && c.requireCvv ? (
							<div className='ml-auto w-24'>
								<CvvInput
									bare
									inputSize='sm'
									value={savedCvv}
									onValueChange={onSavedCvvChange}
									aria-label='Kayıtlı kart CVV'
								/>
							</div>
						) : (
							active && <CheckCircleIcon className='ml-auto h-5 w-5 text-primary-500' />
						)}
					</label>
				);
			})}

			<label className={rowCls(selected === NEW_CARD)}>
				<Radio name='savedcard' checked={selected === NEW_CARD} onChange={() => onSelect(NEW_CARD)} />
				<span className='inline-flex h-8 w-12 items-center justify-center rounded-md border border-dashed border-border text-muted'>
					<PlusIcon className='h-5 w-5' />
				</span>
				<span className='font-medium text-heading'>Yeni kart ile öde</span>
			</label>
		</>
	);
}
