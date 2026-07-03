'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowUturnLeftIcon, XCircleIcon } from '@heroicons/react/24/outline';
import {
  Button,
  StatusBadge,
  enumLabel,
  paymentProviderConfig,
  paymentHoldStatusConfig,
  orderStatusConfig,
} from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { DetailPage } from '@/components/detail/DetailPage';
import { SectionCard } from '@/components/detail/SectionCard';
import { PartyCard } from '@/components/detail/PartyCard';
import { DataList, Field } from '@/components/detail/DataList';
import { fmtTry, fmtDateTime } from '@/lib/format';
import { paymentStatusConfig } from '../_lib/types';
import { type PaymentDetail } from './types';
import { RefundPaymentModal } from './_modals/RefundPaymentModal';
import { ForceCancelPaymentModal } from './_modals/ForceCancelPaymentModal';

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <DetailPage<PaymentDetail>
      resource="payments"
      id={id}
      fetcher={(pid) => adminApi.getPayment(pid).then((r) => r.data)}
      backHref="/finance/payments"
      emptyTitle="Ödeme bulunamadı"
      title={() => 'Ödeme Detayı'}
      subtitle={(p) =>
        p.orderNumber ? `Sipariş #${p.orderNumber}` : `Ödeme #${p.id?.slice(0, 8) ?? ''}`
      }
      badge={(p) => <StatusBadge status={p.status} config={paymentStatusConfig} />}
      actions={(p) => (
        <>
          {p.status === 'completed' && (
            <Button
              variant="danger"
              leftIcon={<ArrowUturnLeftIcon className="h-5 w-5" />}
              onClick={() => setRefundOpen(true)}
            >
              Manuel İade
            </Button>
          )}
          {p.status !== 'completed' && p.status !== 'refunded' && (
            <Button
              variant="primary"
              leftIcon={<XCircleIcon className="h-5 w-5" />}
              onClick={() => setCancelOpen(true)}
            >
              Zorla İptal
            </Button>
          )}
        </>
      )}
    >
      {(p) => (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <SectionCard title="Ödeme Bilgileri">
                <DataList>
                  <Field label="Ödeme ID">
                    <span className="font-mono text-xs">{p.id}</span>
                  </Field>
                  <Field label="Tutar">{fmtTry(p.amount)}</Field>
                  <Field label="Para Birimi">{p.currency}</Field>
                  <Field label="Sağlayıcı">{enumLabel(paymentProviderConfig, p.provider)}</Field>
                  <Field label="Transaction ID">
                    <span className="font-mono text-xs">
                      {p.providerPaymentId || p.providerConversationId || 'N/A'}
                    </span>
                  </Field>
                  <Field label="Oluşturulma">{fmtDateTime(p.createdAt)}</Field>
                  {p.paidAt && <Field label="Ödeme Tarihi">{fmtDateTime(p.paidAt)}</Field>}
                </DataList>
                {p.failureReason && (
                  <div className="mt-4 rounded-lg border border-danger-200 bg-danger-50 p-3">
                    <p className="text-sm text-danger-800">
                      <strong>Hata Nedeni:</strong> {p.failureReason}
                    </p>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Sipariş Bilgileri">
                {p.order ? (
                  <DataList>
                    <Field label="Sipariş No">
                      <Link
                        href={`/operations/orders/${p.orderId}`}
                        className="text-primary-600 hover:text-primary-700"
                      >
                        #{p.order.orderNumber}
                      </Link>
                    </Field>
                    <Field label="Ürün">{p.order.product?.title ?? '—'}</Field>
                    <Field label="Sipariş Durumu">
                      {enumLabel(orderStatusConfig, p.order.status)}
                    </Field>
                    <Field label="Toplam Tutar">{fmtTry(p.order.totalAmount)}</Field>
                    <Field label="Komisyon">{fmtTry(p.order.commissionAmount)}</Field>
                  </DataList>
                ) : (
                  <p className="text-sm text-muted">
                    Bu ödeme bir siparişe bağlı değil (üyelik, grup veya takas-nakit ödemesi
                    olabilir).
                  </p>
                )}
              </SectionCard>

              {p.order && (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <PartyCard
                    title="Alıcı"
                    name={p.order.buyer?.displayName ?? '—'}
                    userHref={p.order.buyer?.id ? `/accounts/users/${p.order.buyer.id}` : undefined}
                    email={p.order.buyer?.email}
                  />
                  <PartyCard
                    title="Satıcı"
                    name={p.order.seller?.displayName ?? '—'}
                    userHref={
                      p.order.seller?.id ? `/accounts/users/${p.order.seller.id}` : undefined
                    }
                    email={p.order.seller?.email}
                  />
                </div>
              )}

              {p.paymentHolds && p.paymentHolds.length > 0 && (
                <SectionCard title="Ödeme Bekletmeleri" bodyClassName="space-y-3">
                  {p.paymentHolds.map((hold) => (
                    <div key={hold.id} className="rounded-lg bg-surface-alt p-3">
                      <DataList columns={1}>
                        <Field label="Tutar">{fmtTry(hold.amount)}</Field>
                        <Field label="Durum">
                          {enumLabel(paymentHoldStatusConfig, hold.status)}
                        </Field>
                        {hold.releaseAt && (
                          <Field label="Serbest Bırakma">
                            {new Date(hold.releaseAt).toLocaleDateString('tr-TR')}
                          </Field>
                        )}
                      </DataList>
                    </div>
                  ))}
                </SectionCard>
              )}
            </div>

            <div className="space-y-6">
              {p.metadata && Object.keys(p.metadata).length > 0 && (
                <SectionCard title="Metadata">
                  <pre className="overflow-auto rounded-lg bg-surface-alt p-3 text-xs">
                    {JSON.stringify(p.metadata, null, 2)}
                  </pre>
                </SectionCard>
              )}
            </div>
          </div>

          {refundOpen && (
            <RefundPaymentModal
              paymentId={p.id}
              amount={p.amount}
              onClose={() => setRefundOpen(false)}
            />
          )}
          {cancelOpen && (
            <ForceCancelPaymentModal paymentId={p.id} onClose={() => setCancelOpen(false)} />
          )}
        </>
      )}
    </DetailPage>
  );
}
