'use client';

import { StatusBadge, Button, paymentHoldStatusConfig } from '@tarodan/ui';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { col } from '@/components/table';
import { ActionButtons } from '@/components/admin-list';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { HoldReasonBadge, holdReasonForRow } from '../_lib/holds';
import { type PayoutTransaction, payoutStatusFilterOptions } from '../_lib/types';

export function TransactionsTab() {
  const release = useAdminMutation((orderId: string) => adminApi.releasePayout(orderId), {
    invalidates: ['payouts-transactions', 'payouts-summary'],
    successMessage: 'Ödeme satıcıya serbest bırakıldı',
  });

  const columns = [
    col.text<PayoutTransaction>('Sipariş', (t) => t.orderNumber),
    col.user<PayoutTransaction>('Satıcı', (t) => ({
      name: t.sellerName,
      secondary: t.sellerEmail,
    })),
    col.money<PayoutTransaction>('Tutar', (t) => t.amount),
    col.badge<PayoutTransaction>('Durum', (t) => (
      <StatusBadge status={t.status} config={paymentHoldStatusConfig} />
    )),
    col.date<PayoutTransaction>('Serbest Bırakma', (t) => t.releasedAt || t.releaseAt),
    col.badge<PayoutTransaction>('Bekleme Nedeni', (t) => (
      <HoldReasonBadge reason={holdReasonForRow({ status: t.status, releaseAt: t.releaseAt })} />
    )),
    col.actions<PayoutTransaction>(
      (t) => {
        if (t.status !== 'held') return null;
        const reason = holdReasonForRow({ status: t.status, releaseAt: t.releaseAt });
        const blocked = reason?.code === 'frozen' || reason?.code === 'open_refund';
        return (
          <ActionButtons>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<CheckCircleIcon className="h-4 w-4" />}
              onClick={() => release.mutate(t.orderId)}
              isLoading={release.isPending && release.variables === t.orderId}
              disabled={blocked}
              title={blocked ? 'Açık iade / kilit nedeniyle serbest bırakılamaz' : undefined}
            >
              Serbest Bırak
            </Button>
          </ActionButtons>
        );
      },
      { header: 'İşlem' },
    ),
  ];

  return (
    <ResourceList<PayoutTransaction>
      resource="payouts-transactions"
      fetcher={(p) =>
        adminApi.getPayoutsTransactions({
          search: p.search,
          page: p.page,
          limit: p.limit,
          status: p.status,
          dateFrom: p.dateFrom,
          dateTo: p.dateTo,
        })
      }
      getRowId={(t) => t.id}
      syncUrl
      initialFilters={{ status: 'all', dateFrom: '', dateTo: '' }}
      errorMessage="İşlem geçmişi yüklenemedi"
    >
      <ResourceList.Toolbar>
        <ResourceList.Search placeholder="Satıcı adı, e-posta veya sipariş no..." />
        <ResourceList.FilterSelect
          name="status"
          options={payoutStatusFilterOptions}
          className="sm:w-44"
        />
        <ResourceList.DateRange fromName="dateFrom" toName="dateTo" />
      </ResourceList.Toolbar>
      <ResourceList.Table columns={columns} emptyText="Kayıt yok" />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
