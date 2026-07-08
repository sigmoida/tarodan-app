'use client';

import { useState } from 'react';
import { CreditCardIcon } from '@heroicons/react/24/outline';
import { Button, Spinner, ConfirmDialog } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useAuthStore } from '@/stores/authStore';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { useTranslation } from '@/i18n';
import { usePayments, usePaymentAction, type PaymentActionType } from './_hooks/usePayments';
import PaymentFilters from './_components/PaymentFilters';
import PaymentCard from './_components/PaymentCard';

export default function PaymentHistoryPage() {
	const { ready } = useRequireAuth();
	const user = useAuthStore((s) => s.user);
	const { t, locale } = useTranslation();
	const [confirm, setConfirm] = useState<{ type: PaymentActionType; paymentId: string } | null>(
		null,
	);

	const enabled = ready;
	const { payments, pagination, isLoading, page, setPage, filters, setFilter, clearFilters } =
		usePayments(enabled);
	const action = usePaymentAction();

	if (!ready) return <AuthLoadingScreen />;

	const runConfirmed = () => {
		if (!confirm) return;
		action.mutate(confirm, { onSettled: () => setConfirm(null) });
	};

	return (
		<PageShell className='pb-16'>
			<PageHeader
				title={t('payment.history')}
				description={t('payment.historyDesc')}
			/>

			<PaymentFilters filters={filters} onChange={setFilter} onClear={clearFilters} />

			{isLoading ? (
				<div className='flex justify-center py-16'>
					<Spinner size='xl' />
				</div>
			) : payments.length === 0 ? (
				<div className='rounded-lg border border-border bg-surface-elevated p-12 text-center'>
					<CreditCardIcon className='mx-auto mb-4 h-16 w-16 text-subtle' />
					<p className='text-lg text-muted'>{t('payment.noHistory')}</p>
				</div>
			) : (
				<>
					<div className='space-y-3'>
						{payments.map((payment) => (
							<PaymentCard
								key={payment.id}
								payment={payment}
								currentUserId={user?.id}
								pending={action.isPending}
								onAction={(type, paymentId) => setConfirm({ type, paymentId })}
							/>
						))}
					</div>

					{pagination && pagination.totalPages > 1 && (
						<div className='flex items-center justify-between border-t border-border pt-4'>
							<p className='text-sm text-body'>
								{locale === 'en'
									? `Total ${pagination.total} payments, Page ${page} / ${pagination.totalPages}`
									: `Toplam ${pagination.total} ödeme, Sayfa ${page} / ${pagination.totalPages}`}
							</p>
							<div className='flex gap-2'>
								<Button
									variant='outline'
									size='sm'
									disabled={page === 1}
									onClick={() => setPage(page - 1)}>
									{t('common.previous')}
								</Button>
								<Button
									variant='outline'
									size='sm'
									disabled={page >= pagination.totalPages}
									onClick={() => setPage(page + 1)}>
									{t('common.next')}
								</Button>
							</div>
						</div>
					)}
				</>
			)}

			<ConfirmDialog
				isOpen={confirm !== null}
				onClose={() => {
					if (!action.isPending) setConfirm(null);
				}}
				onConfirm={runConfirmed}
				isLoading={action.isPending}
				destructive={confirm?.type === 'cancel'}
				title={confirm?.type === 'cancel' ? t('common.cancel') : t('payment.retry')}
				description={
					confirm?.type === 'cancel' ? t('payment.cancelConfirm') : t('payment.retryConfirm')
				}
				confirmLabel={confirm?.type === 'cancel' ? t('common.cancel') : t('payment.retry')}
			/>
		</PageShell>
	);
}
