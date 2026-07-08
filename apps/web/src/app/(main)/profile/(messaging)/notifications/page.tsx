/** @format */

'use client';

import { useMemo, useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { Button, Select, Spinner } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import { useRequireAuth } from '../../_hooks/useRequireAuth';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { EmptyStateCard } from '../../_components/EmptyStateCard';
import { useNotifications } from './_hooks/useNotifications';
import NotificationCard from './_components/NotificationCard';
import {
	FILTER_LABELS,
	getNotificationCategory,
	type FilterType,
} from './_lib/notifications';

export default function NotificationsPage() {
	const { t, locale } = useTranslation();
	const { ready } = useRequireAuth();
	const [filter, setFilter] = useState<FilterType>('all');

	const { notifications, isLoading, markRead, markAllRead } = useNotifications(ready);

	const unreadCount = notifications.filter((n) => !n.isRead).length;
	const filtered = useMemo(
		() =>
			notifications.filter((n) => {
				if (filter === 'all') return true;
				if (filter === 'unread') return !n.isRead;
				return getNotificationCategory(n.type) === filter;
			}),
		[notifications, filter],
	);

	if (!ready) return <AuthLoadingScreen />;

	const description =
		unreadCount > 0
			? `${unreadCount} ${locale === 'en' ? 'unread' : 'okunmamış'}`
			: locale === 'en'
				? 'All caught up!'
				: 'Tümü okundu!';

	return (
		<PageShell className='pb-16'>
			<PageHeader
				title={locale === 'en' ? 'Notifications' : 'Bildirimler'}
				description={description}
				actions={
					<>
						<Select
							value={filter}
							onChange={(e) => setFilter(e.target.value as FilterType)}
							className='w-auto'
							aria-label={locale === 'en' ? 'Filter' : 'Filtrele'}>
							{(Object.keys(FILTER_LABELS) as FilterType[]).map((key) => (
								<option
									key={key}
									value={key}>
									{FILTER_LABELS[key][locale as 'tr' | 'en']}
									{key === 'unread' && unreadCount > 0
										? ` (${unreadCount})`
										: ''}
								</option>
							))}
						</Select>
						{unreadCount > 0 && (
							<Button
								variant='secondary'
								onClick={markAllRead}
								leftIcon={<CheckCircleIcon className='w-4 h-4' />}>
								{locale === 'en' ? 'Mark all read' : 'Tümünü oku'}
							</Button>
						)}
					</>
				}
			/>

			{isLoading ? (
				<div className='flex flex-col items-center justify-center py-16'>
					<Spinner
						size='xl'
						color='border-primary-500 border-t-transparent'
						className='mb-4'
					/>
					<p className='text-muted'>
						{locale === 'en' ? 'Loading...' : 'Yükleniyor...'}
					</p>
				</div>
			) : filtered.length === 0 ? (
				<EmptyStateCard
					title={
						filter === 'unread'
							? locale === 'en'
								? 'No unread notifications'
								: 'Okunmamış bildirim yok'
							: locale === 'en'
								? 'No notifications yet'
								: 'Henüz bildirim yok'
					}
					description={
						locale === 'en'
							? 'When you receive notifications, they will appear here.'
							: 'Bildirimleriniz burada görünecek.'
					}
				/>
			) : (
				<div className='space-y-2'>
					{filtered.map((notification) => (
						<NotificationCard
							key={notification.id}
							notification={notification}
							onMarkRead={markRead}
						/>
					))}
				</div>
			)}
		</PageShell>
	);
}
