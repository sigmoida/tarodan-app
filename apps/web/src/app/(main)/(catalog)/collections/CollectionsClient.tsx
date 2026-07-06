/** @format */

'use client';

import Link from 'next/link';
import { FolderPlusIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Button } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Container } from '@/components/layout/Container';
import CreateCollectionModal from '@/components/CreateCollectionModal';
import {
	CollectionsProvider,
	useCollections,
} from './_context/CollectionsContext';
import CollectionsToolbar from './_components/CollectionsToolbar';
import CollectionsGrid from './_components/CollectionsGrid';

function CollectionsLayout() {
	const { t } = useTranslation();
	const {
		mounted,
		isAuthenticated,
		limits,
		flatCategories,
		showCreateModal,
		setShowCreateModal,
		showPremiumModal,
		setShowPremiumModal,
		handleCreateClick,
		handleCreated,
	} = useCollections();

	const canCreate = mounted && isAuthenticated && limits?.canCreateCollections;
	const needsUpgrade =
		mounted && isAuthenticated && !limits?.canCreateCollections;

	return (
		<PageShell>
			<PageHeader
				title={t('collection.collections')}
				description={t('footer.description')}
				actions={
					<>
						{canCreate && (
							<Button
								variant='primary'
								size='md'
								onClick={handleCreateClick}
								className='flex items-center gap-1.5'>
								<FolderPlusIcon className='w-4 h-4' />
								{t('collection.createCollection')}
							</Button>
						)}
						{needsUpgrade && (
							<Link
								href='/pricing'
								className='px-4 py-2 bg-surface-alt text-body hover:bg-border-subtle rounded text-sm font-medium transition-colors'>
								{t('membership.upgrade')}
							</Link>
						)}
					</>
				}
			/>

			<CollectionsToolbar />
			<CollectionsGrid />

			{/* Create Collection Modal */}
			{showCreateModal && (
				<CreateCollectionModal
					flatCategories={flatCategories}
					onClose={() => setShowCreateModal(false)}
					onCreated={handleCreated}
				/>
			)}

			{/* Premium Required Modal */}
			{showPremiumModal && (
				<div className='fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4'>
					<div className='bg-surface-elevated rounded-lg max-w-md w-full p-6 text-center'>
						<div className='w-14 h-14 bg-primary-50 rounded-lg flex items-center justify-center mx-auto mb-4'>
							<FolderPlusIcon className='w-7 h-7 text-primary-500' />
						</div>
						<h2 className='text-lg font-bold text-heading mb-2'>
							Üyelik Yükseltme Gerekli
						</h2>
						<p className='text-muted text-sm mb-5'>
							Koleksiyon oluşturma özelliği Temel ve üzeri üyelikler için
							aktiftir.
						</p>
						<div className='flex gap-3'>
							<Button
								variant='outline'
								size='md'
								className='flex-1'
								onClick={() => setShowPremiumModal(false)}>
								Vazgeç
							</Button>
							<Link
								href='/membership'
								className='flex-1 px-4 py-2.5 bg-primary-500 text-inverted rounded font-medium hover:bg-primary-600 transition-colors text-center text-sm'>
								Üyeliği Yükselt
							</Link>
						</div>
					</div>
				</div>
			)}
		</PageShell>
	);
}

export default function CollectionsClient() {
	return (
		<CollectionsProvider>
			<CollectionsLayout />
		</CollectionsProvider>
	);
}
