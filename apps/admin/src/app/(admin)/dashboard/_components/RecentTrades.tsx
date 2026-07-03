/** @format */

import Link from 'next/link';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { StatusBadge } from '@tarodan/ui';
import { SectionCard } from '@/components/detail/SectionCard';
import {
	type RecentTrade,
	dashboardTradeStatusConfig,
	formatRelativeDate,
} from '../_lib/types';

function tradeSummary(trade: RecentTrade) {
	const initiatorName =
		trade.initiator?.displayName || trade.initiator?.email || 'Kullanıcı';
	const receiverName =
		trade.receiver?.displayName || trade.receiver?.email || 'Kullanıcı';
	const initiatorItems = (trade.items || []).filter(
		(i) => i.side === 'initiator',
	);
	const receiverItems = (trade.items || []).filter(
		(i) => i.side === 'receiver',
	);
	const offered = initiatorItems[0]?.product?.title;
	const requested = receiverItems[0]?.product?.title;
	const offeredLabel = offered
		? offered +
			(initiatorItems.length > 1 ? ` (+${initiatorItems.length - 1})` : '')
		: '—';
	const requestedLabel = requested
		? requested +
			(receiverItems.length > 1 ? ` (+${receiverItems.length - 1})` : '')
		: '—';
	return { initiatorName, receiverName, offeredLabel, requestedLabel };
}

export function RecentTrades({ trades }: { trades: RecentTrade[] }) {
	return (
		<SectionCard
			title='Son Takaslar'
			actions={
				<Link
					href='/operations/trades'
					className='text-sm text-primary-600 hover:underline'>
					Tümünü Gör →
				</Link>
			}>
			<div className='space-y-3'>
				{trades.length > 0 ? (
					trades.map((trade) => {
						const s = tradeSummary(trade);
						return (
							<div
								key={trade.id}
								className='flex items-center justify-between border-b border-border py-3 last:border-0'>
								<div className='flex min-w-0 flex-1 items-center'>
									<div className='mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-500/20'>
										<ArrowsRightLeftIcon className='h-5 w-5 text-success-700' />
									</div>
									<div className='min-w-0'>
										<p className='truncate text-sm text-heading'>
											<span className='font-medium'>{s.initiatorName}</span>
											<span className='mx-2 text-muted'>→</span>
											<span className='font-medium'>{s.receiverName}</span>
										</p>
										<p className='truncate text-xs text-muted'>
											{s.offeredLabel} → {s.requestedLabel}
										</p>
									</div>
								</div>
								<div className='ml-3 flex items-center gap-3'>
									<StatusBadge
										status={trade.status}
										config={dashboardTradeStatusConfig}
									/>
									<span className='whitespace-nowrap text-xs text-muted'>
										{formatRelativeDate(trade.createdAt)}
									</span>
								</div>
							</div>
						);
					})
				) : (
					<div className='py-8 text-center text-muted'>
						Henüz takas bulunmuyor
					</div>
				)}
			</div>
		</SectionCard>
	);
}
