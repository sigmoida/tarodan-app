/** @format */

'use client';

import { useState } from 'react';
import { Button } from '@tarodan/ui';
import { PlusIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { AdminTabs } from '@/components/AdminTabs';
import { ModerationEventsPanel } from '@/components/ModerationEventsPanel';
import { ResourceList } from '@/components/list';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useTabParam } from '@/hooks/useTabParam';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import type { Collection } from './_lib/types';
import { collectionColumns } from './_lib/columns';
import { CollectionFormModal } from './_modals/CollectionFormModal';

const COLLECTION_TABS = [
	{ key: 'list', label: 'Koleksiyonlar' },
	{ key: 'ai', label: 'AI Denetim' },
];

const PUBLIC_OPTIONS = [
	{ value: 'all', label: 'Tüm Görünürlük' },
	{ value: 'true', label: 'Görünür' },
	{ value: 'false', label: 'Gizli' },
];
const FEATURED_OPTIONS = [
	{ value: 'all', label: 'Tümü' },
	{ value: 'true', label: 'Öne Çıkan' },
];

export default function CollectionsPage() {
	const confirm = useConfirm();
	const [tab, setTab] = useTabParam('list');
	const [modal, setModal] = useState<{ collection?: Collection } | null>(null);

	const del = useAdminMutation((id: string) => adminApi.deleteCollection(id), {
		invalidates: ['collections'],
		successMessage: 'Koleksiyon silindi',
	});
	const toggle = useAdminMutation(
		(c: Collection) => adminApi.setCollectionVisibility(c.id, !c.isPublic),
		{ invalidates: ['collections'] },
	);

	const onDelete = async (c: Collection) => {
		if (
			await confirm({
				title: 'Koleksiyonu Sil',
				description:
					'Bu koleksiyonu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
				destructive: true,
			})
		)
			del.mutate(c.id);
	};

	const columns = collectionColumns({
		onToggleVisibility: (c) => toggle.mutate(c),
		onEdit: (c) => setModal({ collection: c }),
		onDelete,
	});

	// Chrome (title + New button + tabs) is page-level and persists across tab
	// switches; only the content below swaps and suspends (like operations/shipping).
	return (
		<AdminPage>
			<PageHeader
				title='Koleksiyonlar'
				description='Kullanıcı koleksiyonlarını görüntüle, düzenle ve öne çıkar'>
				<Button
					variant='primary'
					leftIcon={<PlusIcon className='h-5 w-5' />}
					onClick={() => setModal({})}>
					Yeni Koleksiyon
				</Button>
			</PageHeader>
			<AdminTabs
				tabs={COLLECTION_TABS}
				value={tab}
				onChange={setTab}
			/>

			{tab === 'ai' ? (
				<ModerationEventsPanel
					entityType='collection'
					chrome={false}
				/>
			) : (
				<ResourceList<Collection>
					resource='collections'
					fetcher={(params) =>
						adminApi.getCollections({
							page: params.page,
							limit: params.limit,
							search: params.search,
							isPublic:
								params.isPublic !== undefined
									? params.isPublic === 'true'
									: undefined,
							isFeatured:
								params.isFeatured !== undefined
									? params.isFeatured === 'true'
									: undefined,
							sortBy: params.sortBy,
							sortOrder: params.sortOrder,
						})
					}
					getRowId={(c) => c.id}
					syncUrl
					initialFilters={{
						isPublic: 'all',
						isFeatured: 'all',
						sortBy: '',
						sortOrder: '',
					}}
					errorMessage='Koleksiyonlar yüklenemedi'>
					<ResourceList.Toolbar>
						<ResourceList.Search />
						<ResourceList.FilterSelect
							name='isPublic'
							options={PUBLIC_OPTIONS}
							className='sm:w-44'
						/>
						<ResourceList.FilterSelect
							name='isFeatured'
							options={FEATURED_OPTIONS}
							className='sm:w-40'
						/>
					</ResourceList.Toolbar>
					<ResourceList.Table
						columns={columns}
						emptyText='Henüz koleksiyon yok'
					/>
					<ResourceList.Total unit='koleksiyon' />
					<ResourceList.Pagination />
				</ResourceList>
			)}

			{modal && (
				<CollectionFormModal
					key={modal.collection?.id ?? 'new'}
					open
					onClose={() => setModal(null)}
					collection={modal.collection}
				/>
			)}
		</AdminPage>
	);
}
