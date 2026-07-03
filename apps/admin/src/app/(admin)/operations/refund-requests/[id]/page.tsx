'use client';

import { useParams } from 'next/navigation';
import { CheckCircleIcon, UserIcon } from '@heroicons/react/24/outline';
import { StatusBadge, refundRequestStatusConfig } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { useConfirm } from '@/components/ConfirmProvider';
import { DetailPage } from '@/components/detail/DetailPage';
import { PartyCard } from '@/components/detail/PartyCard';
import { RefundStatusStepper } from '@/components/refunds/RefundStatusStepper';
import { RefundNextActionPanel } from '@/components/refunds/RefundNextActionPanel';
import {
  RefundPolicyCard,
  type ReturnShippingPayer,
} from '@/components/refunds/RefundPolicyCard';
import type { HistoryEntry, RefundRequestDetail } from './types';
import { fmtDate, fmtTry } from './_lib/format';
import { RefundReasonSection } from './_sections/RefundReasonSection';
import { ReturnShippingSection } from './_sections/ReturnShippingSection';
import { RefundHistorySection } from './_sections/RefundHistorySection';
import { RefundTechnicalDetails } from './_sections/RefundTechnicalDetails';

export default function RefundRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();

  const forceFinalize = useAdminMutation(() => adminApi.forceFinalizeRefund(id), {
    invalidates: ['refund-requests', 'refunds'],
    successMessage: 'Para iadesi tamamlandı',
  });
  const savePolicy = useAdminMutation(
    (payload: {
      refundProductAmount?: boolean;
      refundShippingFee?: boolean;
      refundBuyerFee?: boolean;
      refundSellerCommission?: boolean;
    }) => adminApi.overrideRefundPolicy(id, payload),
    { invalidates: ['refund-requests'], successMessage: 'İade politikası güncellendi' },
  );
  const savePayer = useAdminMutation(
    (payer: ReturnShippingPayer) => adminApi.setReturnShippingPayer(id, payer),
    { invalidates: ['refund-requests'], successMessage: 'İade kargo tarafı güncellendi' },
  );

  const handleForceFinalize = async () => {
    if (
      !(await confirm({
        description: 'Para iadesi manuel olarak tamamlanacak. Onaylıyor musunuz?',
        destructive: true,
      }))
    )
      return;
    forceFinalize.mutate();
  };
  const handleSavePolicy = async (payload: Parameters<typeof savePolicy.mutateAsync>[0]) => {
    try {
      await savePolicy.mutateAsync(payload);
    } catch {
      /* handled by useAdminMutation */
    }
  };
  const handleSavePayer = async (payer: ReturnShippingPayer) => {
    try {
      await savePayer.mutateAsync(payer);
    } catch {
      /* handled by useAdminMutation */
    }
  };

  return (
    <DetailPage<RefundRequestDetail>
      resource="refund-requests"
      id={id}
      fetcher={(rid) => adminApi.getRefundRequest(rid).then((r) => r.data?.data ?? r.data)}
      backHref="/operations/refund-requests"
      emptyTitle="Talep bulunamadı"
      title={(rr) => (
        <>
          İade Kaydı
          <span className="ml-2 font-mono text-base text-muted">{rr.refundNumber}</span>
        </>
      )}
      subtitle={(rr) => `Oluşturma: ${fmtDate(rr.createdAt)} — İade tutarı: ${fmtTry(rr.amount)}`}
      badge={(rr) => <StatusBadge status={rr.status} config={refundRequestStatusConfig} />}
    >
      {(rr) => {
        const canForceFinalize = rr.status === 'return_delivered' && !rr.refundedAt;
        const history: HistoryEntry[] = Array.isArray(rr.metadata?.history)
          ? (rr.metadata!.history as HistoryEntry[])
          : [];
        return (
          <>
            <RefundStatusStepper status={rr.status} />

            <RefundNextActionPanel
              status={rr.status}
              reason={rr.reason}
              amount={Number(rr.amount)}
              canForceFinalize={canForceFinalize}
              finalizing={forceFinalize.isPending}
              onFinalize={handleForceFinalize}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <PartyCard
                title="Alıcı (Talep Eden)"
                icon={UserIcon}
                name={rr.requester.displayName}
                userHref={`/accounts/users/${rr.requester.id}`}
                email={rr.requester.email}
                phone={rr.requester.phone}
              />
              <PartyCard
                title="Satıcı"
                icon={UserIcon}
                name={rr.order.seller.displayName}
                userHref={`/accounts/users/${rr.order.seller.id}`}
                email={rr.order.seller.email}
                phone={rr.order.seller.phone}
              />
            </div>

            <RefundReasonSection rr={rr} />
            <ReturnShippingSection rr={rr} />

            {rr.refundedAt && (
              <div className="rounded-xl border border-success-200 bg-success-50 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="h-6 w-6 flex-shrink-0 text-success-600" />
                  <div>
                    <div className="font-semibold text-success-900">
                      Para iadesi tamamlandı — {fmtTry(rr.amount)}
                    </div>
                    <div className="text-sm text-success-800">{fmtDate(rr.refundedAt)}</div>
                  </div>
                </div>
              </div>
            )}

            <RefundPolicyCard
              initial={{
                refundProductAmount: rr.refundProductAmount ?? true,
                refundShippingFee: rr.refundShippingFee ?? true,
                refundBuyerFee: rr.refundBuyerFee ?? true,
                refundSellerCommission: rr.refundSellerCommission ?? true,
                returnShippingPayer: rr.returnShippingPayer ?? null,
              }}
              order={{
                subtotal: rr.order.subtotal != null ? Number(rr.order.subtotal) : null,
                shippingCost: Number(rr.order.shippingCost ?? 0),
                buyerFeeAmount: Number(rr.order.buyerFeeAmount ?? 0),
                commissionAmount: Number(rr.order.commissionAmount ?? 0),
              }}
              onSavePolicy={handleSavePolicy}
              onSavePayer={handleSavePayer}
              disabled={rr.status === 'refunded' || rr.status === 'cancelled'}
            />

            <RefundHistorySection history={history} />
            <RefundTechnicalDetails rr={rr} history={history} />
          </>
        );
      }}
    </DetailPage>
  );
}
