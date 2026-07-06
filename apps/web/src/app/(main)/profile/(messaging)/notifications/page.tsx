/** @format */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { Button, Select, Spinner } from '@tarodan/ui';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useNotifications } from './_hooks/useNotifications';
import NotificationCard from './_components/NotificationCard';
import {
	FILTER_LABELS,
	getNotificationCategory,
	type FilterType,
} from './_lib/notifications';

export default function NotificationsPage() {
	const router = useRouter();
	const { t, locale } = useTranslation();
	const { isAuthenticated, isLoading: authLoading } = useAuthStore();
	const [filter, setFilter] = useState<FilterType>('all');

	useEffect(() => {
		if (authLoading) return;
		if (!isAuthenticated) router.push('/login?redirect=/profile/notifications');
	}, [authLoading, isAuthenticated, router]);

	const { notifications, isLoading, markRead, markAllRead } = useNotifications(
		!authLoading && isAuthenticated,
	);

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

	if (authLoading) return <AuthLoadingScreen />;
	if (!isAuthenticated) return null;

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
				<div className='rounded-xl border border-border bg-surface-elevated py-16 text-center'>
					<div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt'>
						<BellIcon className='h-8 w-8 text-subtle' />
					</div>
					<h3 className='mb-1 text-lg font-semibold text-heading'>
						{filter === 'unread'
							? locale === 'en'
								? 'No unread notifications'
								: 'Okunmamış bildirim yok'
							: locale === 'en'
								? 'No notifications yet'
								: 'Henüz bildirim yok'}
					</h3>
					<p className='mx-auto max-w-sm text-muted'>
						{locale === 'en'
							? 'When you receive notifications, they will appear here.'
							: 'Bildirimleriniz burada görünecek.'}
					</p>
				</div>
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
