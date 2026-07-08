import Link from 'next/link';
import { StatusBadge, refundReasonConfig, orderStatusConfig } from '@tarodan/ui';
import { SectionCard } from '@/components/detail/SectionCard';
import type { RefundRequestDetail } from '../types';
import { fmtTry } from '../_lib/format';
import { Field } from '../_components/Field';

export function RefundReasonSection({ rr }: { rr: RefundRequestDetail }) {
  const orderQty = rr.order.quantity != null ? Number(rr.order.quantity) : 1;
  const refundQty = rr.refundQuantity != null ? Number(rr.refundQuantity) : orderQty;
  const isPartialQty = orderQty > 1 && refundQty < orderQty;
  const unitPrice =
    rr.order.unitPrice != null
      ? Number(rr.order.unitPrice)
      : rr.order.subtotal != null && orderQty > 0
        ? Number(rr.order.subtotal) / orderQty
        : null;

  return (
    <SectionCard title="Neden iade isteniyor?" bodyClassName="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-alt">
          {rr.order.product.images?.[0]?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={rr.order.product.images[0].url}
              alt={rr.order.product.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl">📦</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium text-body">{rr.order.product.title}</div>
          <Link
            href={`/operations/orders/${rr.order.id}`}
            className="font-mono text-sm text-primary-600 hover:underline"
          >
            {rr.order.orderNumber}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
        <Field label="İade sebebi">
          <StatusBadge status={rr.reason} config={refundReasonConfig} />
        </Field>
        <Field label="Sipariş durumu">
          <StatusBadge status={rr.order.status} config={orderStatusConfig} />
        </Field>
        <Field label="Sipariş tutarı">{fmtTry(rr.order.totalAmount)}</Field>
        <Field label="İade tutarı">
          <span className="font-semibold">{fmtTry(rr.amount)}</span>
        </Field>
        <Field label="İade adedi">
          <span className={isPartialQty ? 'font-semibold text-warning-700' : ''}>
            {refundQty} / {orderQty} adet{isPartialQty && ' (kısmi iade)'}
          </span>
        </Field>
        {unitPrice != null && <Field label="Birim fiyat">{fmtTry(unitPrice)}</Field>}
      </div>

      {isPartialQty && unitPrice != null && (
        <div className="space-y-1 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm">
          <div className="font-medium text-warning-800">Kısmi iade kırılımı</div>
          <div className="flex justify-between text-warning-900">
            <span>
              İade edilen ürün bedeli ({refundQty} × {fmtTry(unitPrice)})
            </span>
            <span className="font-semibold">{fmtTry(unitPrice * refundQty)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>
              Satıcıda kalan ({orderQty - refundQty} × {fmtTry(unitPrice)})
            </span>
            <span>{fmtTry(unitPrice * (orderQty - refundQty))}</span>
          </div>
          <p className="pt-1 text-xs text-warning-700">
            {orderQty} adetlik siparişin {refundQty} adedi iade ediliyor; kalan{' '}
            {orderQty - refundQty} adet siparişte kalır.
          </p>
        </div>
      )}

      {rr.description && (
        <div className="text-sm">
          <span className="font-medium text-body">Alıcının açıklaması:</span>
          <p className="mt-1 whitespace-pre-wrap text-muted">{rr.description}</p>
        </div>
      )}

      {rr.evidencePhotoUrls && rr.evidencePhotoUrls.length > 0 && (
        <div>
          <span className="mb-2 block font-medium text-body">Kanıt fotoğrafları:</span>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {rr.evidencePhotoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Kanıt ${i + 1}`}
                  className="h-24 w-full rounded border border-border object-cover transition-opacity hover:opacity-90"
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
