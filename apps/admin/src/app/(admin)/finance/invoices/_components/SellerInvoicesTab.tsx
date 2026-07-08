/** @format */

'use client';

import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { sellerColumns } from '../_lib/columns';
import { type SellerInvoice, mapSellerInvoices } from '../_lib/types';

export function SellerInvoicesTab() {
	return (
		<ResourceList<SellerInvoice>
			resource='seller-invoices'
			fetcher={(p) =>
				adminApi.getSellerInvoices(p).then((res) => {
					const root = res.data ?? {};
					const raw = root.data ?? root.items ?? [];
					const total = root.meta?.total ?? root.total ?? raw.length;
					return {
						...res,
						data: { data: mapSellerInvoices(raw), meta: { total } },
					};
				})
			}
			getRowId={(s) => s.id}
			syncUrl
			initialFilters={{ startDate: '', endDate: '' }}
			errorMessage='Faturalar yüklenemedi'>
			<ResourceList.Toolbar>
				<ResourceList.Search />
				<ResourceList.DateRange />
			</ResourceList.Toolbar>
			<ResourceList.Total unit='fatura' />
			<ResourceList.Table
				columns={sellerColumns}
				emptyText='Fatura bulunamadı'
			/>
			<ResourceList.Pagination />
		</ResourceList>
	);
}
