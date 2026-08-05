"use client";

import { useState } from "react";
import {
  buildOrderBreakdown,
  type OrderBreakdownLineKey,
} from "@tarodan/shared";
import Link from "next/link";
import Image from "next/image";
import { ChevronRightIcon, TruckIcon } from "@heroicons/react/24/outline";
import {
  Badge,
  Button,
  StatusBadge,
  paymentHoldStatusConfig,
  refundRequestStatusConfig,
} from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";
import { DataList, Field } from "@/components/detail/DataList";
import { fmtDate, fmtDateTime, fmtTry } from "@/lib/format";
import { useSession } from "@/context/SessionContext";
import { usePspFeeRate } from "@/hooks/usePspFeeRate";
import {
  canManuallyUpdateOrderStatus,
  getOrderStatusInfo,
} from "../_lib/status";
import {
  activeRefundOf,
  type OrderFileEntry,
  type OrderFileFinance,
} from "../_lib/fileTypes";
import { StatusUpdateModal } from "../_modals/StatusUpdateModal";
import { AddTrackingModal } from "../_modals/AddTrackingModal";

/**
 * Grup dosyasında TEK siparişin tam bölümü: statü + tarihler, ürün, tam finansal
 * kırılım (stopaj/KDV dahil), GERÇEK escrow hold'u, iade talepleri, komisyon
 * defteri ve sipariş-başına admin aksiyonları. Ayrı sipariş detay ekranı yoktur —
 * her şey burada, grup çatısının altında.
 *
 * KART DEĞİL bölümdür: satıcı paketinin kartının içinde, üstündeki çizgiyle
 * ayrılır. Kendi kartı olduğunda paket çatısıyla arasındaki bağ görsel olarak
 * kopuyordu.
 */
export function OrderFileBlock({ entry }: { entry: OrderFileEntry }) {
  const t = useTranslations();
  const { user } = useSession();
  const [statusOpen, setStatusOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const canManage = user.role === "super_admin" || user.role === "admin";

  const status = getOrderStatusInfo(
    { ...entry, activeRefundRequest: activeRefundOf(entry) },
    t,
  );
  const f = entry.finance;

  return (
    <section className="mt-5 border-t border-border pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm font-medium text-heading">
            #{entry.orderNumber}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color} ${status.bg}`}
          >
            {status.label}
          </span>
        </span>
        <div className="flex flex-wrap gap-2">
          {canManage && canManuallyUpdateOrderStatus(entry.status) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStatusOpen(true)}
            >
              {t("admin.operations.orders.updateStatus")}
            </Button>
          )}
          {canManage && entry.status === "preparing" && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<TruckIcon className="h-4 w-4" />}
              onClick={() => setTrackingOpen(true)}
            >
              {t("admin.operations.orders.addTracking")}
            </Button>
          )}
        </div>
      </div>

      {/* Ürün satırı */}
      <div className="flex items-start gap-4">
        {entry.product.imageUrl && (
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
            <Image
              src={entry.product.imageUrl}
              alt={entry.product.title ?? ""}
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/catalog/products/${entry.product.id}`}
            className="font-medium text-heading hover:text-primary-600"
          >
            {entry.product.title ?? entry.product.id}
          </Link>
          {/* Adet ve birim fiyat YALNIZ çoklu adette bilgi taşır: tek adette
              ikisi de aşağıdaki "Ürün bedeli" satırının aynısıdır ve ekranda
              üçüncü bir fiyat varmış izlenimi bırakıyordu. */}
          {entry.quantity > 1 && (
            <p className="text-sm text-muted">
              {t("admin.operations.orders.file.quantity")}: {entry.quantity}
              {entry.unitPrice != null && (
                <>
                  {" "}
                  · {t("admin.operations.orders.file.unitPrice")}:{" "}
                  {fmtTry(entry.unitPrice)}
                </>
              )}
            </p>
          )}
          <p className="mt-0.5 text-xs text-subtle">
            {fmtDateTime(entry.createdAt)}
            {entry.deliveredAt && (
              <>
                {" · "}
                {t("admin.operations.orders.file.deliveredAt")}:{" "}
                {fmtDate(entry.deliveredAt)}
              </>
            )}
            {entry.confirmationDeadline && !entry.completedAt && (
              <>
                {" · "}
                {t("admin.operations.orders.file.confirmationDeadline")}:{" "}
                {fmtDate(entry.confirmationDeadline)}
              </>
            )}
          </p>
        </div>
        <p className="flex-shrink-0 text-base font-semibold text-heading">
          {fmtTry(f.totalAmount)}
        </p>
      </div>

      {/* Finansal kırılım — her kalem ayrı satır. Tutarı 0 olan kalem GİZLENMEZ:
          satır kaybolunca admin, kalemin sıfır mı olduğunu yoksa hiç
          uygulanmadığını mı ayırt edemiyordu. */}
      <OrderMoneyBreakdown
        f={f}
        isRefunded={
          entry.status === "refunded" || entry.ledger?.status === "refunded"
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
        {/* Hangi komisyon kuralına düştüğü: sipariş anındaki snapshot. Tıklanınca
            kural ekranı açılır ve o kuralın dialogu kendiliğinden gelir —
            admin, oranların nereden geldiğini listede aramak zorunda kalmasın. */}
        <span>
          <span className="text-muted">
            {t("admin.operations.orders.file.commissionRule")}:{" "}
          </span>
          {entry.commissionRule ? (
            <Link
              href={`/finance/commission?ruleId=${entry.commissionRule.id}`}
              className="font-medium text-primary-600 hover:underline"
            >
              {entry.commissionRule.name ??
                t("admin.operations.orders.file.commissionRuleUnnamed")}
            </Link>
          ) : (
            <span className="font-medium text-heading">—</span>
          )}
        </span>
        {entry.ledger && (
          <span>
            <span className="text-muted">
              {t("admin.operations.orders.file.ledgerTitle")}:{" "}
            </span>
            <span className="font-medium text-heading">
              {t(
                `admin.operations.orders.file.ledgerStatus.${entry.ledger.status}` as Parameters<
                  typeof t
                >[0],
              )}
            </span>
          </span>
        )}
      </div>

      {/* Escrow — TAHMİN değil gerçek hold kaydı; aksiyon Satıcı Ödemelerinde */}
      <div className="mt-4 rounded-lg bg-surface-alt p-4 text-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-medium text-heading">
            {t("admin.operations.orders.escrow.title")}
          </p>
          {entry.escrow && (
            <Badge
              status={entry.escrow.status}
              config={paymentHoldStatusConfig}
            />
          )}
        </div>
        {entry.escrow ? (
          <DataList columns={2}>
            <Field label={t("admin.operations.orders.file.escrowAmount")}>
              {fmtTry(entry.escrow.amount)}
            </Field>
            {entry.escrow.refundedAmount > 0 && (
              <Field label={t("admin.operations.orders.file.escrowRefunded")}>
                <span className="text-danger-600">
                  −{fmtTry(entry.escrow.refundedAmount)}
                </span>
              </Field>
            )}
            {entry.escrow.releasedAt ? (
              <Field label={t("admin.operations.orders.file.escrowReleased")}>
                {fmtDateTime(entry.escrow.releasedAt)}
              </Field>
            ) : (
              <Field label={t("admin.operations.orders.file.escrowRelease")}>
                {entry.escrow.releaseAt
                  ? fmtDateTime(entry.escrow.releaseAt)
                  : "—"}
              </Field>
            )}
          </DataList>
        ) : (
          <p className="text-muted">
            {t("admin.operations.orders.file.escrowNone")}
          </p>
        )}
        {entry.escrow?.frozenByRefundId && (
          <p className="mt-2 text-xs font-medium text-danger-600">
            {t("admin.operations.orders.file.escrowFrozen")}
          </p>
        )}
        {entry.escrow && (
          <Button asChild variant="ghost" size="sm" className="mt-2">
            <Link href="/finance/payouts?tab=escrow">
              {t("admin.operations.orders.file.openPayouts")}
              <ChevronRightIcon className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      {/* İade talepleri — K5: artık detayda da görünür ve talebe link verir */}
      {entry.refundRequests.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-heading">
            {t("admin.operations.orders.file.refundsTitle")}
          </p>
          <div className="space-y-2">
            {entry.refundRequests.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono">{r.refundNumber}</span>
                  <StatusBadge
                    status={r.status}
                    config={refundRequestStatusConfig}
                    size="sm"
                  />
                  <span className="text-muted">
                    {t("admin.operations.orders.file.refundQty", {
                      count: r.refundQuantity,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted">
                    {t("admin.operations.orders.file.refundedTotal")}:
                  </span>
                  <span className="font-medium">{fmtTry(r.amount)}</span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/operations/refund-requests/${r.id}`}>
                      {t("admin.operations.orders.file.openRefund")}
                      <ChevronRightIcon className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {entry.cancelReason && (
        <p className="mt-3 text-xs text-muted">
          {t("admin.operations.orders.banners.cancelReason", {
            reason: entry.cancelReason,
          })}
        </p>
      )}

      <StatusUpdateModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        orderId={entry.id}
        currentStatus={entry.status}
      />
      <AddTrackingModal
        open={trackingOpen}
        onClose={() => setTrackingOpen(false)}
        orderId={entry.id}
      />
    </section>
  );
}

/** Primitifin kalem anahtarı → çeviri anahtarı (next-intl literal ister). */
const LINE_LABEL = {
  sellerCommission: "admin.operations.orders.file.sellerCommission",
  sellerShipping: "admin.operations.orders.file.shippingSeller",
  sellerPlatformFee: "admin.operations.orders.file.sellerPlatformFee",
  buyerCommission: "admin.operations.orders.file.buyerCommission",
  buyerShipping: "admin.operations.orders.file.shippingBuyer",
  buyerServiceFee: "admin.operations.orders.file.buyerServiceFee",
} as const satisfies Record<OrderBreakdownLineKey, string>;

/**
 * Siparişin para kırılımı — satıcı tarafı, alıcı tarafı ve paranın nereye
 * gittiği. Tutarlar siparişte SNAPSHOT olarak duruyor; burada yeniden
 * hesaplanmıyor, yalnız kalemlere ayrılıyor. Kalem KDV'si sipariş anındaki
 * `serviceVatRate` ile türetilir, güncel ayarla değil — oran sonradan değişse
 * bile eski sipariş tahsil edildiği haliyle görünür.
 */
function OrderMoneyBreakdown({
  f,
  isRefunded,
}: {
  f: OrderFileFinance;
  isRefunded: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pspFeeRate = usePspFeeRate();
  const b = buildOrderBreakdown({
    subtotal: f.subtotal,
    sellerCommissionAmount: f.sellerCommissionAmount,
    sellerPlatformFeeAmount: f.sellerPlatformFeeAmount,
    sellerShippingAmount: f.sellerShippingAmount,
    buyerCommissionAmount: f.buyerCommissionAmount,
    buyerServiceFeeAmount: f.buyerServiceFeeAmount,
    buyerShippingAmount: f.buyerShippingAmount,
    withholdingTaxAmount: f.withholdingTaxAmount,
    serviceVatRate: f.serviceVatRate,
    pspFeeRate,
  });

  const formatRate = (rate: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(rate);
  const withRate = (label: string, rate: number) => {
    const rateText = `%${formatRate(rate)}`;
    return label.endsWith(")")
      ? label.replace(/\)$/, `, ${rateText})`)
      : `${label} (${rateText})`;
  };
  const withholdingRate =
    f.subtotal > 0
      ? Math.round((f.withholdingTaxAmount / f.subtotal) * 10_000) / 100
      : 0;

  const Line = ({
    label,
    amount,
    vat,
  }: {
    label: string;
    amount: number;
    vat?: number;
  }) => (
    <div className="grid grid-cols-[minmax(max-content,1fr)_7rem_5rem] items-baseline gap-x-3 py-0.5">
      <span className="whitespace-nowrap text-muted">{label}</span>
      {/* Sabit genişlik + sağa yaslama: tutar sütunu içeriğe göre daralınca
          "₺0,06" ile "₺885,60" aynı sütunda hizasız duruyordu. */}
      <span className="text-right tabular-nums text-heading">
        {fmtTry(amount)}
      </span>
      <span className="text-right text-xs tabular-nums text-subtle">
        {vat == null ? "" : fmtTry(vat)}
      </span>
    </div>
  );

  const Total = ({
    label,
    amount,
    tone,
  }: {
    label: string;
    amount: number;
    tone?: string;
  }) => (
    <div className="mt-1 grid grid-cols-[minmax(max-content,1fr)_7rem_5rem] items-baseline gap-x-3 border-t border-border pt-1 font-medium">
      <span className="whitespace-nowrap">{label}</span>
      <span className={`text-right tabular-nums ${tone ?? "text-heading"}`}>
        {fmtTry(amount)}
      </span>
      <span />
    </div>
  );

  const Head = ({ title }: { title: string }) => (
    <div className="grid grid-cols-[minmax(max-content,1fr)_7rem_5rem] gap-x-3 text-xs uppercase tracking-wide text-subtle">
      <span>{title}</span>
      <span className="text-right">
        {t("admin.operations.orders.file.lineAmount")}
      </span>
      <span className="text-right">
        {t("admin.operations.orders.file.lineVat")}
      </span>
    </div>
  );

  type SideValue = { label: string; amount: number; vat?: number };
  const SideCells = ({ value }: { value?: SideValue }) =>
    value ? (
      <>
        <span className="whitespace-nowrap text-muted">{value.label}</span>
        <span className="whitespace-nowrap text-right tabular-nums text-heading">
          {fmtTry(value.amount)}
        </span>
        <span className="whitespace-nowrap text-right text-xs tabular-nums text-subtle">
          {value.vat == null ? "" : fmtTry(value.vat)}
        </span>
      </>
    ) : (
      <>
        <span aria-hidden />
        <span aria-hidden />
        <span aria-hidden />
      </>
    );

  const PairedLine = ({
    seller,
    buyer,
    total = false,
    sellerTone,
    buyerTone,
  }: {
    seller?: SideValue;
    buyer?: SideValue;
    total?: boolean;
    sellerTone?: string;
    buyerTone?: string;
  }) => (
    <div
      className={`grid grid-cols-[minmax(max-content,1fr)_7rem_5rem_minmax(max-content,1fr)_7rem_5rem] items-baseline gap-x-3 py-0.5 ${
        total ? "mt-1 border-t border-border pt-1 font-medium" : ""
      }`}
    >
      {seller ? (
        <>
          <span className="whitespace-nowrap text-muted">{seller.label}</span>
          <span
            className={`whitespace-nowrap text-right tabular-nums ${sellerTone ?? "text-heading"}`}
          >
            {fmtTry(seller.amount)}
          </span>
          <span className="whitespace-nowrap text-right text-xs tabular-nums text-subtle">
            {seller.vat == null ? "" : fmtTry(seller.vat)}
          </span>
        </>
      ) : (
        <SideCells />
      )}
      {buyer ? (
        <>
          <span className="whitespace-nowrap text-muted">{buyer.label}</span>
          <span
            className={`whitespace-nowrap text-right tabular-nums ${buyerTone ?? "text-heading"}`}
          >
            {fmtTry(buyer.amount)}
          </span>
          <span className="whitespace-nowrap text-right text-xs tabular-nums text-subtle">
            {buyer.vat == null ? "" : fmtTry(buyer.vat)}
          </span>
        </>
      ) : (
        <SideCells />
      )}
    </div>
  );

  const sellerRows: SideValue[] = [
    {
      label: t("admin.operations.orders.file.productPrice"),
      amount: b.subtotal,
    },
    ...b.seller.lines.map((line) => ({
      label: t(LINE_LABEL[line.key]),
      amount: line.amount,
      vat: line.vat,
    })),
    {
      label: t("admin.operations.orders.file.sellerVatTotal"),
      amount: b.seller.vatTotal,
    },
    {
      label: withRate(
        t("admin.operations.orders.file.withholding"),
        withholdingRate,
      ),
      amount: b.seller.withholding,
    },
  ];
  const buyerRows: SideValue[] = [
    {
      label: t("admin.operations.orders.file.productPrice"),
      amount: b.subtotal,
    },
    ...b.buyer.lines.map((line) => ({
      label: t(LINE_LABEL[line.key]),
      amount: line.amount,
      vat: line.vat,
    })),
    {
      label: t("admin.operations.orders.file.buyerVatTotal"),
      amount: b.buyer.vatTotal,
    },
  ];

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
      {isRefunded && (
        <p className="rounded-lg bg-warning-50 px-3 py-2 text-warning-800">
          {t("admin.operations.orders.file.refundedBreakdownNote")}
        </p>
      )}
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[minmax(max-content,1fr)_7rem_5rem_minmax(max-content,1fr)_7rem_5rem] gap-x-3 text-xs uppercase tracking-wide text-subtle">
            <span>{t("admin.operations.orders.file.sellerSide")}</span>
            <span className="text-right">
              {t("admin.operations.orders.file.lineAmount")}
            </span>
            <span className="text-right">
              {t("admin.operations.orders.file.lineVat")}
            </span>
            <span>{t("admin.operations.orders.file.buyerSide")}</span>
            <span className="text-right">
              {t("admin.operations.orders.file.lineAmount")}
            </span>
            <span className="text-right">
              {t("admin.operations.orders.file.lineVat")}
            </span>
          </div>
          {sellerRows.map((seller, index) => (
            <PairedLine
              key={seller.label}
              seller={seller}
              buyer={buyerRows[index]}
            />
          ))}
          <PairedLine
            total
            seller={{
              label: t("admin.operations.orders.file.sellerDeductionTotal"),
              amount: b.seller.deductionTotal,
            }}
            buyer={{
              label: t("admin.operations.orders.file.buyerAddedTotal"),
              amount: b.buyer.addedTotal,
            }}
            sellerTone="text-danger-600"
          />
          <PairedLine
            total
            seller={{
              label: t("admin.operations.orders.financial.sellerNet"),
              amount: b.seller.net,
            }}
            buyer={{
              label: t("admin.operations.orders.financial.buyerTotal"),
              amount: b.buyer.payable,
            }}
            sellerTone="text-success-600"
            buyerTone="text-primary-600"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[440px]">
          <Head title={t("admin.operations.orders.file.moneySplit")} />
          {/* Şelale: elde kalan brütten maliyetler sırayla düşülür → net hak ediş. */}
          <Line
            label={t("admin.operations.orders.file.grossRetained")}
            amount={b.platform.grossRetained}
          />
          <Line
            label={t("admin.operations.orders.file.platformShipping")}
            amount={-b.platform.shipping}
          />
          <Line
            label={t("admin.operations.orders.file.afterShipping")}
            amount={b.platform.afterShipping}
          />
          <Line
            label={withRate(
              t("admin.operations.orders.file.withholding"),
              withholdingRate,
            )}
            amount={-b.seller.withholding}
          />
          <Line
            label={t("admin.operations.orders.file.afterWithholding")}
            amount={b.platform.afterWithholding}
          />
          <Line
            label={withRate(
              t("admin.operations.orders.file.serviceVatOut"),
              f.serviceVatRate,
            )}
            amount={-b.platform.vatOut}
          />
          <Line
            label={t("admin.operations.orders.file.afterVat")}
            amount={b.platform.afterVat}
          />
          <Line
            label={withRate(
              t("admin.operations.orders.file.pspFee"),
              pspFeeRate,
            )}
            amount={-b.platform.pspFee}
          />
          <Total
            label={t(
              isRefunded
                ? "admin.operations.orders.file.netRevenueAtCharge"
                : "admin.operations.orders.file.netRevenue",
            )}
            amount={b.platform.netRevenue}
            tone="text-primary-600"
          />
          <div className="grid grid-cols-[minmax(max-content,1fr)_7rem_5rem] gap-x-3 pt-1 text-xs text-subtle">
            <span>{t("admin.operations.orders.file.netTakeRate")}</span>
            <span className="text-right tabular-nums">
              %{b.platform.netTakeRate}
            </span>
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
