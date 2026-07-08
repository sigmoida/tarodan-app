/** @format */

'use client';

import {
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
	Badge,
	ThumbnailStack,
} from '@tarodan/ui';
import OptimizedImage from '@/components/OptimizedImage';
import { useTranslation } from '@/i18n';
import {
	formatTL,
	getOrderPrimary,
	orderAmount,
	type OrderGroup,
} from '../_lib/types';
import OrderCard from './OrderCard';
import { type OrderActionHandlers } from './OrderActions';

const PLACEHOLDER = 'https://placehold.co/128x128/f3f4f6/9ca3af?text=%F0%9F%9A%97';

interface OrderGroupAccordionProps {
	group: OrderGroup;
	actions: OrderActionHandlers;
}

/**
 * A multi-item checkout group. Collapsed: overlapping thumbnails + "N-item cart"
 * summary + total. Expanded (via the shared `@tarodan/ui` Accordion): each item
 * as a compact `OrderCard` in an indented, accent-barred column.
 */
export default function OrderGroupAccordion({
	group,
	actions,
}: OrderGroupAccordionProps) {
	const { locale } = useTranslation();
	const total = group.orders.reduce((sum, o) => sum + orderAmount(o), 0);
	const date = group.orders[0]?.createdAt;

	return (
		<Accordion
			type='single'
			collapsible
			className='overflow-hidden rounded-lg border border-border bg-surface-elevated'>
			<AccordionItem value={group.key} className='border-b-0'>
				<AccordionTrigger className='p-6 hover:bg-surface-alt/30'>
					<div className='flex-1'>
						{/* Row 1 — label + item-count badge */}
						<div className='mb-4 flex items-start justify-between'>
							<div className='text-left'>
								<p className='text-sm font-normal text-muted'>
									{locale === 'en' ? 'Multi-item order' : 'Çoklu sipariş'}
								</p>
								<p className='text-sm font-normal text-subtle'>
									{date ? new Date(date).toLocaleDateString('tr-TR') : ''}
								</p>
							</div>
							<Badge variant='info' size='sm'>
								{group.orders.length} {locale === 'en' ? 'items' : 'ürün'}
							</Badge>
						</div>

						{/* Row 2 — overlapping thumbnails */}
						<div className='flex items-center gap-4'>
							<ThumbnailStack
								items={group.orders}
								getKey={(o) => o.id}
								max={4}
								size='lg'
								renderItem={(o) => {
									const { image } = getOrderPrimary(o);
									return (
										<OptimizedImage
											src={image || PLACEHOLDER}
											alt=''
											fill
											className='object-cover'
											fallbackSrc={PLACEHOLDER}
											logContext={{ orderId: o.id, page: 'orders-group' }}
										/>
									);
								}}
							/>
							<div className='min-w-0 flex-1 text-left'>
								<p className='font-medium text-heading'>
									{locale === 'en'
										? `Cart of ${group.orders.length} items`
										: `${group.orders.length} ürünlük sepet`}
								</p>
								<p className='text-sm font-normal text-muted'>
									{locale === 'en'
										? 'Each item ships separately'
										: 'Her ürün ayrı kargolanır'}
								</p>
							</div>
						</div>

						{/* Row 3 — total */}
						<div className='mt-4 border-t border-border-subtle pt-4 text-left'>
							<p className='text-xs font-normal text-muted'>
								{locale === 'en' ? 'Total' : 'Toplam'}
							</p>
							<p className='text-lg font-semibold text-primary-500'>
								{formatTL(total)}
							</p>
						</div>
					</div>
				</AccordionTrigger>

				<AccordionContent className='py-0'>
					<div className='ml-3 space-y-3 border-l-2 border-primary-300 pl-4'>
						{group.orders.map((order) => (
							<OrderCard key={order.id} order={order} actions={actions} compact />
						))}
					</div>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
