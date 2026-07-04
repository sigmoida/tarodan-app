/** @format */

'use client';

import { useState } from 'react';
import {
	BuildingOfficeIcon,
	PhoneIcon,
	CalendarIcon,
	HashtagIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { useConfirm } from '@/provider/ConfirmProvider';
import { usePrompt } from '@/provider/PromptProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { applicationColumns } from '../_lib/columns';
import { applicationRowMenu } from '../_lib/rowActions';
import { type Application } from '../_lib/types';

/** The applications list for one status tab — expandable rows + approve/reject. */
export function ApplicationsList({ status }: { status: string }) {
	const confirm = useConfirm();
	const prompt = usePrompt();
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const approve = useAdminMutation(
		(id: string) => adminApi.approveSellerApplication(id),
		{
			invalidates: ['seller-applications'],
			successMessage: 'Başvuru onaylandı',
			errorMessage: 'Onaylama sırasında hata oluştu',
			onSuccess: () => setExpandedId(null),
		},
	);
	const reject = useAdminMutation(
		(v: { id: string; reason: string }) =>
			adminApi.rejectSellerApplication(v.id, v.reason),
		{
			invalidates: ['seller-applications'],
			successMessage: 'Başvuru reddedildi',
			errorMessage: 'Red işlemi sırasında hata oluştu',
			onSuccess: () => setExpandedId(null),
		},
	);

	const onApprove = async (app: Application) => {
		const ok = await confirm({
			description: `"${app.companyName}" başvurusunu onaylamak istediğinize emin misiniz? Hesap aktif satıcı olarak işaretlenecek.`,
		});
		if (ok) approve.mutate(app.id);
	};

	const onReject = async (app: Application) => {
		const reason = await prompt({
			title: 'Başvuruyu Reddet',
			description: 'Red nedeni (kullanıcıya gönderilecek):',
			placeholder: 'Lütfen red nedenini açıklayın...',
		});
		if (reason === null) return;
		reject.mutate({ id: app.id, reason });
	};

	const columns = applicationColumns(
		applicationRowMenu({
			expandedId,
			onToggleExpand: (a) =>
				setExpandedId((prev) => (prev === a.id ? null : a.id)),
			onApprove,
			onReject,
		}),
	);

	const renderExpanded = (app: Application) => (
		<div className='grid grid-cols-1 gap-6 border-t border-border bg-surface-alt/40 p-6 md:grid-cols-3'>
			<div>
				<h4 className='mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted'>
					<BuildingOfficeIcon className='h-4 w-4' /> Firma Bilgileri
				</h4>
				<div className='space-y-2 text-sm'>
					<div>
						<span className='block text-xs text-muted'>Firma Adı</span>
						<span className='font-medium text-heading'>{app.companyName}</span>
					</div>
					{app.taxId && (
						<div>
							<span className='flex items-center gap-1 text-xs text-muted'>
								<HashtagIcon className='h-3 w-3' />
								Vergi No
							</span>
							<span className='font-medium text-heading'>{app.taxId}</span>
						</div>
					)}
				</div>
			</div>

			<div>
				<h4 className='mb-3 text-xs font-semibold text-muted'>İletişim</h4>
				<div className='space-y-2 text-sm'>
					<div>
						<span className='block text-xs text-muted'>E-posta</span>
						<span className='text-heading'>{app.email}</span>
					</div>
					{app.phone && (
						<div>
							<span className='flex items-center gap-1 text-xs text-muted'>
								<PhoneIcon className='h-3 w-3' />
								Telefon
							</span>
							<span className='text-heading'>{app.phone}</span>
						</div>
					)}
					<div>
						<span className='flex items-center gap-1 text-xs text-muted'>
							<CalendarIcon className='h-3 w-3' />
							Başvuru Tarihi
						</span>
						<span className='text-heading'>
							{new Date(app.createdAt).toLocaleString('tr-TR')}
						</span>
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<ResourceList<Application>
			resource='seller-applications'
			fetcher={(params) => adminApi.getSellerApplications(params)}
			getRowId={(a) => a.id}
			syncUrl
			initialFilters={{ status }}
			errorMessage='Başvurular yüklenemedi'>
			<ResourceList.Toolbar>
				<ResourceList.Search />
			</ResourceList.Toolbar>
			<ResourceList.Table
				columns={columns}
				emptyText='Başvuru bulunamadı'
				expandedId={expandedId}
				renderExpanded={renderExpanded}
			/>
			<ResourceList.Pagination />
		</ResourceList>
	);
}
