/** @format */

'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { HeartIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { withChunkErrorLogging } from '@/lib/withChunkErrorLogging';
import {
	CollectionDetailProvider,
	useCollectionDetail,
} from './_context/CollectionDetailContext';
import CollectionBreadcrumbs from './_components/CollectionBreadcrumbs';
import CollectionHeaderCard from './_components/CollectionHeaderCard';
import CollectionItemsGrid from './_components/CollectionItemsGrid';
import AddItemModal from './_modals/AddItemModal';

const AuthRequiredModal = dynamic(
	withChunkErrorLogging(
		() => import('@/components/AuthRequiredModal'),
		'AuthRequiredModal',
	),
	{ ssr: false },
);

function CollectionDetailSkeleton() {
	return (
		<div className='animate-pulse space-y-6'>
			<div className='flex gap-6 rounded border border-border bg-surface-elevated p-6'>
				<div className='h-48 w-48 flex-shrink-0 rounded bg-border-subtle' />
				<div className='flex-1 space-y-3'>
					<div className='h-6 w-1/3 rounded bg-border-subtle' />
					<div className='h-4 w-2/3 rounded bg-border-subtle' />
					<div className='h-3 w-1/4 rounded bg-border-subtle' />
				</div>
			</div>
			<div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
				{[...Array(6)].map((_, i) => (
					<div
						key={i}
						className='overflow-hidden rounded border border-border-subtle bg-surface-elevated'>
						<div className='aspect-square bg-border-subtle' />
						<div className='space-y-2 p-3'>
							<div className='h-3 w-3/4 rounded bg-border-subtle' />
							<div className='h-4 w-1/2 rounded bg-border-subtle' />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function CollectionDetailLayout() {
	const {
		t,
		isLoading,
		error,
		collection,
		collectionIdOrSlug,
		showAuthModal,
		setShowAuthModal,
	} = useCollectionDetail();

	return (
		<PageShell>
			<PageHeader breadcrumb={<CollectionBreadcrumbs />} />

			{isLoading ? (
				<CollectionDetailSkeleton />
			) : error || !collection ? (
				<div className='rounded border border-border bg-surface-elevated py-20 text-center'>
					<p className='mb-4 text-muted'>
						{error || t('collection.collectionNotFound')}
					</p>
					<Link
						href='/collections'
						className='text-sm font-medium text-primary-500 hover:text-primary-600'>
						{t('collection.backToCollections')}
					</Link>
				</div>
			) : (
				<>
					<CollectionHeaderCard />
					<CollectionItemsGrid />
					<AddItemModal />
				</>
			)}

			<AuthRequiredModal
				isOpen={showAuthModal}
				onClose={() => setShowAuthModal(false)}
				title={t('collection.loginToLike')}
				message={t('collection.loginToLikeMsg')}
				icon={<HeartIcon className='h-10 w-10 text-primary-500' />}
				redirectPath={
					collection?.id
						? `/collections/${collection.id}`
						: `/collections/${collectionIdOrSlug}`
				}
			/>
		</PageShell>
	);
}

export default function CollectionDetailClient() {
	return (
		<CollectionDetailProvider>
			<CollectionDetailLayout />
		</CollectionDetailProvider>
	);
}
