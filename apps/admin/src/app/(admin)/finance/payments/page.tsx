/** @format */

'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@tarodan/ui';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { AdminPage } from '@/components/page/AdminPage';
import { PageHeader } from '@/components/AdminList';
import { ResourceList } from '@/components/list';
import {
	type Payment,
	mapPayments,
	paymentStatusFilterOptions,
	providerFilterOptions,
} from './_lib/types';
import { paymentColumns } from './_lib/columns';
import { paymentRowMenu } from './_lib/rowActions';

export default function PaymentsPage() {
	const router = useRouter();

	return (
		<AdminPage>
			<PageHeader
				title='Ödeme Yönetimi'
				description='Tüm ödeme işlemleri ve durumları'>
				<Button
					variant='secondary'
					leftIcon={<ChartBarIcon className='h-5 w-5' />}
					onClick={() => router.push('/finance/payments/statistics')}>
					İstatistikler
				</Button>
			</PageHeader>

			<ResourceList<Payment>
				resource='payments'
				fetcher={(p) =>
					adminApi.getPayments(p).then((res) => {
						const root = res.data ?? {};
						const raw = root.data ?? root.items ?? [];
						const total = root.meta?.total ?? root.total ?? raw.length;
						return {
							...res,
							data: { data: mapPayments(raw), meta: { total } },
						};
					})
				}
				getRowId={(p) => p.id}
				syncUrl
				initialFilters={{
					status: 'all',
					provider: 'all',
					startDate: '',
					endDate: '',
				}}
				errorMessage='Ödemeler yüklenemedi'>
				<ResourceList.Toolbar>
					<ResourceList.Search />
					<ResourceList.FilterSelect
						name='status'
						options={paymentStatusFilterOptions}
						className='sm:w-44'
					/>
					<ResourceList.FilterSelect
						name='provider'
						options={providerFilterOptions}
						className='sm:w-36'
					/>
					<ResourceList.DateRange />
				</ResourceList.Toolbar>
				<ResourceList.Total unit='ödeme' />
				<ResourceList.Table
					columns={paymentColumns(
						paymentRowMenu((p) => router.push(`/finance/payments/${p.id}`)),
					)}
					emptyText='Ödeme bulunamadı'
				/>
				<ResourceList.Pagination />
			</ResourceList>
		</AdminPage>
	);
}
