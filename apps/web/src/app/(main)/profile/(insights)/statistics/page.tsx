'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
	TagIcon,
	ShoppingBagIcon,
	ArrowsRightLeftIcon,
	EyeIcon,
	HeartIcon,
	RectangleStackIcon,
	StarIcon,
	TrophyIcon,
	CalendarDaysIcon,
	SparklesIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { Badge, Button, Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import MetricCard from '@/components/ui/MetricCard';
import { useAuthStore } from '@/stores/authStore';
import { useStatistics, useRecentSales } from './_hooks/useStatistics';
import { membershipDuration } from './_lib/types';
import StatSummaryCard from './_components/StatSummaryCard';
import FinancialCards from './_sections/FinancialCards';
import RecentSalesSection from './_sections/RecentSalesSection';
import QuickLinksCard from './_sections/QuickLinksCard';

export default function StatisticsPage() {
	const router = useRouter();
	const { isAuthenticated, isLoading: authLoading } = useAuthStore();

	useEffect(() => {
		if (!authLoading && !isAuthenticated) router.push('/login');
	}, [authLoading, isAuthenticated, router]);

	const enabled = !authLoading && isAuthenticated;
	const { stats, isLoading } = useStatistics(enabled);
	const recentSales = useRecentSales(enabled);

	if (authLoading || isLoading || !stats) {
		return (
			<div className='flex items-center justify-center py-24'>
				<Spinner size='xl' color='border-primary-500 border-t-transparent' />
			</div>
		);
	}

	const { days, months } = membershipDuration(stats.memberSince);
	const durationLabel = months > 0 ? `${months} ay` : `${days} gün`;
	const ratePct =
		stats.tradesCount > 0
			? `%${Math.round((stats.successfulTradesCount / stats.tradesCount) * 100)}`
			: '%0';

	return (
		<PageShell className='pb-16'>
			<PageHeader
				title='İstatistiklerim'
				description='Hesap özeti ve performans verileri'
				actions={
					<Badge variant='warning' size='md' icon={<TrophyIcon className='h-4 w-4' />}>
						Üyelik: {durationLabel}
					</Badge>
				}
			/>

			{/* Headline stats */}
			<div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
				<StatSummaryCard
					title='İlanlarım'
					value={stats.productsCount}
					icon={TagIcon}
					accent='text-info-600'
					extraInfo={[
						{ label: 'Aktif', value: stats.activeProductsCount },
						{ label: 'Satıldı', value: stats.soldProductsCount },
					]}
				/>
				<StatSummaryCard
					title='Siparişlerim'
					value={stats.ordersCount}
					icon={ShoppingBagIcon}
					accent='text-success-600'
					extraInfo={[
						{ label: 'Tamamlanan', value: stats.completedOrdersCount },
						{ label: 'Bekleyen', value: stats.ordersCount - stats.completedOrdersCount },
					]}
				/>
				<StatSummaryCard
					title='Takaslarım'
					value={stats.tradesCount}
					icon={ArrowsRightLeftIcon}
					accent='text-primary-600'
					extraInfo={[
						{ label: 'Başarılı', value: stats.successfulTradesCount },
						{ label: 'Oran', value: ratePct },
					]}
				/>
			</div>

			<FinancialCards stats={stats} />

			<RecentSalesSection sales={recentSales} />

			{/* Engagement */}
			<div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
				<MetricCard icon={EyeIcon} label='Görüntüleme' value={stats.totalViews.toLocaleString('tr-TR')} accent='text-info-600' />
				<MetricCard icon={HeartIcon} label='Favori' value={stats.totalFavorites.toLocaleString('tr-TR')} accent='text-danger-600' />
				<MetricCard icon={RectangleStackIcon} label='Koleksiyon' value={stats.collectionsCount} accent='text-primary-600' />
				<MetricCard
					icon={StarIcon}
					label='Puan'
					value={stats.rating > 0 ? stats.rating.toFixed(1) : '-'}
					accent='text-warning-600'
				/>
			</div>

			{/* Seller rating */}
			{stats.rating > 0 && (
				<SectionCard title='Satıcı Puanı'>
					<div className='flex items-center justify-between'>
						<p className='text-sm text-muted'>{stats.reviewsCount} müşteri değerlendirmesi</p>
						<div className='flex items-center gap-2'>
							<div className='flex'>
								{[1, 2, 3, 4, 5].map((star) => (
									<StarSolidIcon
										key={star}
										className={`h-7 w-7 ${
											star <= Math.round(stats.rating) ? 'text-warning-400' : 'text-border-subtle'
										}`}
									/>
								))}
							</div>
							<span className='ml-2 text-3xl font-bold text-heading'>
								{stats.rating.toFixed(1)}
							</span>
						</div>
					</div>
				</SectionCard>
			)}

			<QuickLinksCard />

			{/* Membership */}
			<SectionCard>
				<div className='flex flex-col justify-between gap-4 md:flex-row md:items-center'>
					<div className='flex items-center gap-4'>
						<div className='rounded-xl bg-surface p-3'>
							<CalendarDaysIcon className='h-8 w-8 text-primary-500' />
						</div>
						<div>
							<p className='text-sm text-muted'>Üyelik Başlangıcı</p>
							<p className='text-xl font-semibold text-heading'>
								{new Date(stats.memberSince).toLocaleDateString('tr-TR', {
									year: 'numeric',
									month: 'long',
									day: 'numeric',
								})}
							</p>
							<p className='mt-1 text-sm text-muted'>
								{months > 0
									? `${months} aydır aramızdasınız`
									: `${days} gündür aramızdasınız`}
							</p>
						</div>
					</div>
					<Button asChild className='gap-2'>
						<Link href='/profile/analytics'>
							<SparklesIcon className='h-5 w-5' />
							Detaylı Analiz
						</Link>
					</Button>
				</div>
			</SectionCard>
		</PageShell>
	);
}
