/** @format */

'use client';

import Link from 'next/link';
import {
	ChartBarIcon,
	ShoppingBagIcon,
	TagIcon,
	CurrencyDollarIcon,
	ArrowTrendingUpIcon,
	PlusIcon,
	ClipboardDocumentListIcon,
	ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SectionCard, MetricCard } from '@/components/ui';
import { useLocale, useTranslations } from "next-intl";
import { useSellerDashboard } from '../_hooks/useSellerDashboard';

const QUICK_ACTIONS = [
	{ href: '/listings/new', icon: PlusIcon, key: 'newListing', accent: 'bg-primary-100 text-primary-600' },
	{ href: '/profile/orders?filter=seller', icon: ClipboardDocumentListIcon, key: 'myOrders', accent: 'bg-info-100 text-info-600' },
	{ href: '/profile/listings', icon: TagIcon, key: 'myListings', accent: 'bg-success-100 text-success-600' },
	{ href: '/profile/analytics', icon: ChartBarIcon, key: 'analytics', accent: 'bg-primary-100 text-primary-600' },
] as const;

export default function SellerDashboardClient() {
	const t = useTranslations();
	const { totalRevenue, activeCount, soldCount, pendingCount, isLoading } = useSellerDashboard();

	return (
		<PageShell>
			<div className='mx-auto w-full max-w-5xl space-y-8'>
				<PageHeader title={t('sellerDashboard.title')} description={t('sellerDashboard.subtitle')} />

				{isLoading ? (
					<div className='flex justify-center py-16'>
						<Spinner size='xl' />
					</div>
				) : (
					<>
						{/* Sales overview */}
						<section className='space-y-4'>
							<h2 className='text-lg font-semibold text-heading'>
								{t('sellerDashboard.salesOverview')}
							</h2>
							<div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
								<MetricCard
									icon={CurrencyDollarIcon}
									label={t('sellerDashboard.totalRevenue')}
									value={`${totalRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`}
									accent='text-success-600'
								/>
								<MetricCard
									icon={ShoppingBagIcon}
									label={t('sellerDashboard.activeListings')}
									value={activeCount}
									accent='text-info-600'
								/>
								<MetricCard
									icon={ArrowTrendingUpIcon}
									label={t('sellerDashboard.soldItems')}
									value={soldCount}
									accent='text-primary-600'
								/>
							</div>
						</section>

						{/* Pending orders */}
						<section className='space-y-4'>
							<h2 className='text-lg font-semibold text-heading'>
								{t('sellerDashboard.pendingOrders')}
							</h2>
							<Link
								href='/profile/orders?filter=seller'
								className='block rounded-lg border border-border bg-surface-elevated p-5 transition-shadow hover:shadow-md'>
								<div className='flex items-center justify-between'>
									<div className='flex items-center gap-3'>
										<span className='rounded-lg bg-warning-100 p-2'>
											<ClipboardDocumentListIcon className='h-6 w-6 text-warning-600' />
										</span>
										<div>
											<p className='font-semibold text-heading'>
												{pendingCount === 0
													? t('sellerDashboard.noPendingOrders')
													: t('sellerDashboard.pendingOrdersCount', { count: pendingCount })}
											</p>
											<p className='text-sm text-muted'>{t('sellerDashboard.viewAllOrders')}</p>
										</div>
									</div>
									<ArrowRightIcon className='h-5 w-5 text-subtle' />
								</div>
							</Link>
						</section>

						{/* Quick actions */}
						<section className='space-y-4'>
							<h2 className='text-lg font-semibold text-heading'>
								{t('sellerDashboard.quickActions')}
							</h2>
							<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
								{QUICK_ACTIONS.map(({ href, icon: Icon, key, accent }) => (
									<Link
										key={key}
										href={href}
										className='flex items-center gap-3 rounded-lg border border-border bg-surface-elevated p-4 transition-all hover:border-primary-300 hover:shadow-md'>
										<span className={`rounded-lg p-2 ${accent}`}>
											<Icon className='h-5 w-5' />
										</span>
										<span className='font-medium text-heading'>{t(`sellerDashboard.${key}`)}</span>
									</Link>
								))}
							</div>
						</section>
					</>
				)}
			</div>
		</PageShell>
	);
}
