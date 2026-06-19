'use client';

/**
 * Admin view of full financial breakdown.
 * Shows: subtotal, shippingAmount, buyerFeeAmount, sellerFeeAmount, commissionAmount, totalAmount, sellerNetAmount.
 */

export interface PricingBreakdown {
  subtotal: number;
  shippingAmount: number;
  buyerFeeAmount: number;
  sellerFeeAmount: number;
  commissionAmount: number;
  totalAmount: number;
  sellerNetAmount: number;
}

interface AdminFinancialSummaryProps {
  pricing: PricingBreakdown | null | undefined;
  /** Fallback when pricing is missing: pass flat order fields to derive display values */
  fallback?: {
    subtotal?: number;
    shippingCost?: number;
    buyerFeeAmount?: number;
    sellerFeeAmount?: number;
    commissionAmount?: number;
    totalAmount?: number;
    sellerNetAmount?: number;
  };
  className?: string;
}

const fmt = (n: number) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AdminFinancialSummary({ pricing, fallback, className = '' }: AdminFinancialSummaryProps) {
  const p = pricing ?? null;
  const sub = p?.subtotal ?? fallback?.subtotal ?? (fallback && fallback.totalAmount != null && fallback.shippingCost != null && fallback.buyerFeeAmount != null ? fallback.totalAmount - fallback.shippingCost - fallback.buyerFeeAmount : 0);
  const ship = p?.shippingAmount ?? fallback?.shippingCost ?? 0;
  const buyerFee = p?.buyerFeeAmount ?? fallback?.buyerFeeAmount ?? 0;
  const sellerFee = p?.sellerFeeAmount ?? fallback?.sellerFeeAmount ?? 0;
  const commission = p?.commissionAmount ?? fallback?.commissionAmount ?? 0;
  const total = p?.totalAmount ?? fallback?.totalAmount ?? 0;
  const sellerNet = p?.sellerNetAmount ?? fallback?.sellerNetAmount ?? (sub - sellerFee);

  return (
    <div className={className}>
      <h3 className="text-sm font-semibold text-body mb-3">Finansal Özet</h3>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-2 min-w-0">
          <dt className="text-muted truncate">Ara toplam (ürün):</dt>
          <dd className="font-medium text-heading shrink-0 whitespace-nowrap">₺{fmt(sub)}</dd>
        </div>
        <div className="flex justify-between gap-2 min-w-0">
          <dt className="text-muted truncate">Kargo:</dt>
          <dd className="font-medium text-heading shrink-0 whitespace-nowrap">₺{fmt(ship)}</dd>
        </div>
        <div className="flex justify-between gap-2 min-w-0">
          <dt className="text-muted truncate">Alıcı platform ücreti:</dt>
          <dd className="font-medium text-heading shrink-0 whitespace-nowrap">₺{fmt(buyerFee)}</dd>
        </div>
        <div className="flex justify-between gap-2 min-w-0">
          <dt className="text-muted truncate">Satıcı kesintisi:</dt>
          <dd className="font-medium text-heading shrink-0 whitespace-nowrap">₺{fmt(sellerFee)}</dd>
        </div>
        <div className="flex justify-between gap-2 min-w-0">
          <dt className="text-muted truncate">Toplam komisyon:</dt>
          <dd className="font-medium text-heading shrink-0 whitespace-nowrap">₺{fmt(commission)}</dd>
        </div>
        <div className="flex justify-between gap-2 min-w-0 border-t pt-2 mt-2">
          <dt className="text-heading font-semibold truncate">Alıcı toplam:</dt>
          <dd className="font-semibold text-heading shrink-0 whitespace-nowrap">₺{fmt(total)}</dd>
        </div>
        <div className="flex justify-between gap-2 min-w-0">
          <dt className="text-muted truncate">Satıcı net:</dt>
          <dd className="font-medium text-success-700 shrink-0 whitespace-nowrap">₺{fmt(sellerNet)}</dd>
        </div>
      </dl>
    </div>
  );
}
