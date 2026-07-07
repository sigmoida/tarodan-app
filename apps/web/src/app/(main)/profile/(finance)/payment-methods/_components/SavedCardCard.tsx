/** @format */

'use client';

import { CreditCardIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Badge, IconButton } from '@tarodan/ui';
import type { SavedCard } from '@/lib/api';

export default function SavedCardCard({
	card,
	onDelete,
}: {
	card: SavedCard;
	onDelete: (card: SavedCard) => void;
}) {
	return (
		<div className='flex items-center gap-4 rounded-lg border border-border bg-surface-elevated p-4'>
			<CreditCardIcon className='h-8 w-8 flex-shrink-0 text-primary-500' />
			<div className='min-w-0 flex-1'>
				<div className='flex flex-wrap items-center gap-2'>
					<span className='font-semibold text-heading'>
						{card.brand || 'Kart'} •••• {card.last4}
					</span>
					{card.isDefault && (
						<Badge variant='primary' size='sm'>
							Varsayılan
						</Badge>
					)}
					{card.autoRenewEligible ? (
						<Badge variant='success' size='sm'>
							Oto-yenilemeye uygun
						</Badge>
					) : (
						<Badge variant='warning' size='sm'>
							CVV gerektirir
						</Badge>
					)}
				</div>
				{card.expMonth && card.expYear && (
					<p className='mt-0.5 text-sm text-muted'>
						Son kullanma: {card.expMonth}/{card.expYear}
					</p>
				)}
			</div>
			<IconButton
				variant='danger'
				aria-label='Kartı sil'
				onClick={() => onDelete(card)}
				className='flex-shrink-0'>
				<TrashIcon className='h-5 w-5' />
			</IconButton>
		</div>
	);
}
