/** @format */

'use client';

import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ResourceList } from '@/components/list';
import { type Seller } from './_lib/types';
import { sellerColumns } from './_lib/columns';
import { SellerPerformanceSummary } from './_components/SellerPerformanceSummary';

export default function SellerPerformancePage() {
	return (
		<AdminPage>
			<PageHeader
				title='Satıcı Performansı'
				description='Satıcıların sipariş ve ürün metrikleri'
			/>
			<ResourceList<Seller>
				resource='sellers-performance'
				fetcher={(params) => adminApi.getUsers({ ...params, isSeller: true })}
				getRowId={(s) => s.id}
				syncUrl
				>
				<SellerPerformanceSummary />
				<ResourceList.Toolbar>
					<ResourceList.Search />
				</ResourceList.Toolbar>
				<ResourceList.Table
					columns={sellerColumns}
					emptyText='Satıcı bulunamadı'
				/>
				<ResourceList.Pagination />
			</ResourceList>
		</AdminPage>
	);
}
