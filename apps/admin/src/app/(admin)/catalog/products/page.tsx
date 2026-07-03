/** @format */

'use client';

import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/admin-list';
import { AdminTabs } from '@/components/AdminTabs';
import { ModerationEventsPanel } from '@/components/ModerationEventsPanel';
import { ResourceList } from '@/components/list';
import { useConfirm } from '@/components/ConfirmProvider';
import { usePrompt } from '@/components/PromptProvider';
import { useTabParam } from '@/hooks/useTabParam';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { type Product, PRODUCT_TABS } from './_lib/types';
import { ProductsCountText } from './_components/ProductsCountText';
import { ProductsExport } from './_components/ProductsExport';
import { ProductFilters } from './_components/ProductFilters';
import { ProductsTable } from './_components/ProductsTable';

export default function ProductsPage() {
	const confirm = useConfirm();
	const prompt = usePrompt();
	const [tab, setTab] = useTabParam('list');

	const approve = useAdminMutation(
		(id: string) => adminApi.approveProduct(id),
		{
			invalidates: ['products'],
			successMessage: 'Ürün onaylandı',
		},
	);
	const reject = useAdminMutation(
		(v: { id: string; reason: string }) =>
			adminApi.rejectProduct(v.id, v.reason),
		{ invalidates: ['products'], successMessage: 'Ürün reddedildi' },
	);
	const del = useAdminMutation((id: string) => adminApi.deleteProduct(id), {
		invalidates: ['products'],
		successMessage: 'Ürün kaldırıldı',
	});
	const restore = useAdminMutation(
		(id: string) => adminApi.restoreProduct(id),
		{
			invalidates: ['products'],
			successMessage: 'Ürün geri yüklendi (onay bekliyor)',
		},
	);

	const onApprove = (p: Product) => approve.mutate(p.id);
	const onReject = async (p: Product) => {
		const reason = await prompt({
			title: 'Ürünü Reddet',
			label: 'Reddetme sebebi',
			placeholder: 'Ürünün neden reddedildiğini yaz...',
			confirmLabel: 'Reddet',
			destructive: true,
			requiredMessage: 'Reddetme sebebi gereklidir',
		});
		if (reason === null) return;
		reject.mutate({ id: p.id, reason });
	};
	const onDelete = async (p: Product) => {
		if (
			await confirm({
				title: 'Ürünü kaldır',
				description:
					'Ürün listelerden kaldırılacak (Kaldırıldı durumuna alınır). İstediğinde Geri Yükle ile geri getirebilirsin.',
				confirmLabel: 'Kaldır',
				destructive: true,
			})
		)
			del.mutate(p.id);
	};
	const onRestore = async (p: Product) => {
		if (
			await confirm({
				title: 'Ürünü geri yükle',
				description:
					'Ürün yeniden onaya (Beklemede) düşecek ve onaylandıktan sonra yayınlanacak.',
				confirmLabel: 'Geri Yükle',
			})
		)
			restore.mutate(p.id);
	};

	return (
		<AdminPage>
			<PageHeader
				title='Ürünler'
				description={<ProductsCountText />}>
				<ProductsExport />
			</PageHeader>
			<AdminTabs
				tabs={PRODUCT_TABS}
				value={tab}
				onChange={setTab}
			/>

			{tab === 'ai' ? (
				<ModerationEventsPanel
					entityType='product'
					chrome={false}
				/>
			) : (
				<ResourceList<Product>
					resource='products'
					fetcher={(params) => adminApi.getProducts(params)}
					getRowId={(p) => p.id}
					syncUrl
					initialFilters={{
						status: 'all',
						sellerId: '',
						brandId: '',
						carModelId: '',
					}}
					errorMessage='Ürünler yüklenemedi'>
					<ResourceList.Toolbar>
						<ResourceList.Search placeholder='Ürün veya satıcı ara...' />
						<ProductFilters />
					</ResourceList.Toolbar>
					<ProductsTable
						onApprove={onApprove}
						onReject={onReject}
						onDelete={onDelete}
						onRestore={onRestore}
					/>
					<ResourceList.Pagination />
				</ResourceList>
			)}
		</AdminPage>
	);
}
