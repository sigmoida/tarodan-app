/** @format */

'use client';

import { useState } from 'react';
import {
	Button,
	Select,
	enumLabel,
	subscriptionStatusConfig,
} from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { SectionCard } from '@/components/detail/SectionCard';
import { DataList, Field } from '@/components/detail/DataList';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import {
	type UserDetail,
	MEMBERSHIP_TIER_OPTIONS,
	BILLING_PERIOD_OPTIONS,
} from '../types';

export function MembershipSection({
	userId,
	membership,
}: {
	userId: string;
	membership: UserDetail['membership'];
}) {
	const confirm = useConfirm();
	const [tier, setTier] = useState('');
	const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');

	const cancel = useAdminMutation(() => adminApi.cancelUserMembership(userId), {
		invalidates: ['users'],
		successMessage: 'Üyelik iptal edildi',
	});
	const change = useAdminMutation(
		() => adminApi.changeUserMembership(userId, tier, period),
		{
			invalidates: ['users'],
			successMessage: 'Üyelik güncellendi',
			onSuccess: () => setTier(''),
		},
	);

	const onCancel = async () => {
		const ok = await confirm({
			title: 'Üyeliği İptal Et',
			description:
				'Kullanıcının üyeliğini iptal etmek istediğinizden emin misiniz? Dönem sonuna kadar aktif kalır, sonra ücretsiz plana düşer.',
			confirmLabel: 'İptal Et',
			destructive: true,
		});
		if (ok) cancel.mutate();
	};

	return (
		<SectionCard title='Üyelik Bilgileri'>
			{membership ? (
				<DataList>
					<Field label='Üyelik Seviyesi'>{membership.tier.name}</Field>
					<Field label='Durum'>
						{enumLabel(subscriptionStatusConfig, membership.status)}
					</Field>
					{membership.startDate && (
						<Field label='Başlangıç'>
							{new Date(membership.startDate).toLocaleDateString('tr-TR')}
						</Field>
					)}
					{membership.endDate && (
						<Field label='Bitiş'>
							{new Date(membership.endDate).toLocaleDateString('tr-TR')}
						</Field>
					)}
				</DataList>
			) : (
				<p className='text-sm text-muted'>Üyelik kaydı yok (ücretsiz).</p>
			)}

			<div className='mt-6 space-y-4 border-t border-border pt-6'>
				{membership &&
					membership.tier.type !== 'free' &&
					(membership.status === 'cancelled' ? (
						<span className='inline-block rounded bg-warning-500/10 px-2 py-1 text-xs text-warning-600'>
							İptal edildi — dönem sonuna kadar aktif
						</span>
					) : (
						<Button
							variant='secondary'
							onClick={onCancel}
							isLoading={cancel.isPending}
							className='border border-danger-300 text-danger-600 hover:bg-danger-50'>
							Üyeliği İptal Et
						</Button>
					))}

				<div>
					<p className='mb-2 text-sm text-muted'>
						Üyelik Değiştir (admin — ödeme yok)
					</p>
					<div className='flex flex-wrap items-center gap-3'>
						<Select
							value={tier}
							onChange={(e) => setTier(e.target.value)}
							placeholder='Kademe seçin…'
							options={MEMBERSHIP_TIER_OPTIONS}
							className='sm:w-44'
						/>
						<Select
							value={period}
							onChange={(e) =>
								setPeriod(e.target.value as 'monthly' | 'yearly')
							}
							options={BILLING_PERIOD_OPTIONS}
							className='sm:w-36'
						/>
						<Button
							variant='primary'
							onClick={() => change.mutate()}
							disabled={!tier}
							isLoading={change.isPending}>
							Uygula
						</Button>
					</div>
				</div>
			</div>
		</SectionCard>
	);
}
