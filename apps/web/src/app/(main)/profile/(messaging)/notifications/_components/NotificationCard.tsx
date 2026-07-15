/** @format */

'use client';

import Link from 'next/link';
import { CheckIcon } from '@heroicons/react/24/outline';
import { Badge, IconButton } from '@tarodan/ui';
import { SectionCard } from '@/components/ui';
import { useLocale, useTranslations } from "next-intl";
import { getTimeAgo, type Notification } from '../_lib/notifications';

/**
 * A single notification — a plain SectionCard with the icon, title/message, a
 * timestamp and (when unread) a "mark read" control. Unread items get a subtle
 * primary border + a Badge instead of the old gradient bar / ring animation.
 */
export default function NotificationCard({
	notification,
	onMarkRead,
}: {
	notification: Notification;
	onMarkRead: (id: string) => void;
}) {
	const locale = useLocale();
	const { isRead, data, title, message, createdAt, link } = notification;
	const href = link || data?.link;

	return (
		<SectionCard
			className={`p-4 ${!isRead ? 'border-primary-300' : ''}`}>
			<div className='flex items-start justify-between gap-2'>
				<div className='min-w-0 flex-1'>
					<div className='flex items-center gap-2'>
						<h3 className='font-medium text-heading'>{title}</h3>
						{!isRead && (
							<Badge variant='primary' size='sm'>
								{locale === 'en' ? 'New' : 'Yeni'}
							</Badge>
						)}
					</div>
					<p className='mt-0.5 line-clamp-2 text-sm text-muted'>{message}</p>
				</div>

				<div className='flex flex-shrink-0 items-center gap-1'>
					<span className='whitespace-nowrap text-xs text-subtle'>
						{getTimeAgo(createdAt, locale)}
					</span>
					{!isRead && (
						<IconButton
							size='sm'
							onClick={() => onMarkRead(notification.id)}
							aria-label={locale === 'en' ? 'Mark as read' : 'Okundu işaretle'}>
							<CheckIcon className='h-4 w-4' />
						</IconButton>
					)}
				</div>
			</div>

			{href && (
				<Link
					href={href}
					onClick={() => !isRead && onMarkRead(notification.id)}
					className='mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-500 hover:text-primary-600'>
					{locale === 'en' ? 'View details' : 'Detayları gör'}
					<span>→</span>
				</Link>
			)}
		</SectionCard>
	);
}
