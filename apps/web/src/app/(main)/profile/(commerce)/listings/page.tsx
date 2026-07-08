/** @format */

'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PlusIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Badge, Button, Spinner, Tabs, TabsList, TabsTrigger } from '@tarodan/ui';
import BoostModal from '@/components/BoostModal';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyStateCard } from '@/components/feedback/EmptyStateCard';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAuthStore } from '@/stores/authStore';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useMyListings, useDeleteListing } from './_hooks/useMyListings';
import { useCommissionPreviews } from '@/hooks/useCommissionPreviews';
import { FILTER_TABS } from './_lib/status';
import type { Listing } from './_lib/types';
import ListingCard from './_components/ListingCard';

export default function ProfileListingsPage() {
	const confirm = useConfirm();
	const searchParams = useSearchParams();
	const { ready } = useRequireAuth();
	const user = useAuthStore((s) => s.user);
	const isPremiumUser =
		!!(user as any)?.membershipTier && (user as any).membershipTier !== 'free';

	const [activeFilter, setActiveFilter] = useState(
		searchParams.get('status') || 'all',
	);
	const [boostTarget, setBoostTarget] = useState<Listing | null>(null);

	const { listings, isLoading } = useMyListings(activeFilter, ready);
	const estimatedNets = useCommissionPreviews(
		listings.map((l) => ({ id: l.id, amount: Number(l.price) || 0, categoryId: l.category?.id })),
	);
	const deleteMutation = useDeleteListing();

	const pendingCount = listings.filter((l) => l.status === 'pending').length;

	const handleDelete = async (id: string) => {
		const ok = await confirm({
			title: 'İlanı sil',
			description: 'Bu ilanı silmek istediğinize emin misiniz?',
			confirmLabel: 'Sil',
			destructive: true,
		});
		if (ok) deleteMutation.mutate(id);
	};

	if (!ready) {
		return (
			<div className='flex items-center justify-center py-20'>
				<Spinner size='xl' />
			</div>
		);
	}

	return (
		<PageShell className='pb-16'>
			<PageHeader
				title='İlanlarım'
				description='Tüm ilanlarını tek yerden yönet, düzenle ve performanslarını takip et.'
				actions={
					<ButtonLink
						href='/listings/new'
						className='gap-2'>
						<PlusIcon className='h-5 w-5' />
						Yeni İlan
					</ButtonLink>
				}
			/>

			<Tabs
				value={activeFilter}
				onValueChange={setActiveFilter}>
				<TabsList className='flex w-full flex-wrap'>
					{FILTER_TABS.map((tab) => (
						<TabsTrigger
							key={tab.value}
							value={tab.value}
							className='gap-1.5'>
							{tab.label}
							{tab.value === 'pending' && pendingCount > 0 && (
								<Badge
									variant='warning'
									appearance='solid'
									size='sm'
									className='rounded-full px-1.5'>
									{pendingCount}
								</Badge>
							)}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{pendingCount > 0 && activeFilter !== 'pending' && (
				<div className='rounded-lg border border-warning-200 bg-warning-50 p-4'>
					<div className='flex items-center gap-3'>
						<ClockIcon className='h-6 w-6 text-warning-600' />
						<div>
							<p className='font-medium text-warning-800'>
								{pendingCount} ilanınız onay bekliyor
							</p>
							<p className='text-sm text-warning-600'>
								İlanlar admin tarafından onaylandıktan sonra yayına alınacaktır.
							</p>
						</div>
					</div>
				</div>
			)}

			{isLoading ? (
				<div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
					{[...Array(6)].map((_, i) => (
						<div
							key={i}
							className='animate-pulse rounded-lg border border-border bg-surface-elevated p-4'>
							<div className='mb-4 aspect-square rounded bg-border-subtle' />
							<div className='mb-2 h-5 w-3/4 rounded bg-border-subtle' />
							<div className='h-4 w-1/2 rounded bg-border-subtle' />
						</div>
					))}
				</div>
			) : listings.length === 0 ? (
				<EmptyStateCard
					title={
						activeFilter !== 'all'
							? 'Bu filtreye uygun ilan yok'
							: 'Henüz ilanınız yok'
					}
					description='Koleksiyonunuzdaki ürünleri satışa çıkarın'
					action={<ButtonLink href='/listings/new'>İlk İlanınızı Oluşturun</ButtonLink>}
				/>
			) : (
				<div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
					{listings.map((listing, index) => (
						<ListingCard
							key={listing.id}
							listing={listing}
							index={index}
							estimatedNet={estimatedNets[listing.id]}
							isDeleting={
								deleteMutation.isPending &&
								deleteMutation.variables === listing.id
							}
							onDelete={handleDelete}
							onBoost={setBoostTarget}
						/>
					))}
				</div>
			)}

			{boostTarget && (
				<BoostModal
					listingId={boostTarget.id}
					listingTitle={boostTarget.title}
					boostedUntil={boostTarget.boostedUntil ?? null}
					isPremium={isPremiumUser}
					open={!!boostTarget}
					onClose={() => setBoostTarget(null)}
				/>
			)}
		</PageShell>
	);
}
