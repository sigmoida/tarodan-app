import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Badge,
  enumLabel,
  refundReasonConfig,
  refundRequestStatusConfig,
  shipmentStatusConfig,
} from "@tarodan/ui";
import type { AdminRefundRow } from "@tarodan/types";
import { CellUser, TruncatedText } from "@/components/table";
import { TextLink } from "@/components/TextLink";
import { fmtDate, fmtDateTime, fmtTry } from "@/lib/format";
import { statusConfig } from "@/lib/statusLabels";
import { InvoicePdfButton } from "@/app/(admin)/finance/invoices/_components/InvoicePdfButton";
import { MONEY_STATUS_BADGES } from "../_lib/moneyView";
import {
  TRADE_ROLE_I18N_KEYS,
  refundGroupRef,
  truncateNote,
} from "../_lib/rowView";

const DASH = <span className="text-subtle">—</span>;

/** İade no (kalın, iade dosyasına bağlı) + oluşturulma anı; takasta rol rozeti. */
export function RefundNoCell({ row }: { row: AdminRefundRow }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col items-start gap-0.5 leading-tight">
      <Link
        href={`/operations/refund-requests/${row.id}`}
        className="whitespace-nowrap font-semibold text-primary-600 underline underline-offset-2 hover:text-primary-700"
      >
        {row.refundNo}
      </Link>
      <span className="whitespace-nowrap text-xs text-muted">
        {fmtDateTime(row.createdAt)}
      </span>
      {row.trade && (
        <Badge variant="outline">{t(TRADE_ROLE_I18N_KEYS[row.trade.role])}</Badge>
      )}
    </div>
  );
}

/** Sipariş no (siparişe bağlı) + sipariş tarihi; takas / grup no ikinci satırda. */
export function RefundOrderCell({ row }: { row: AdminRefundRow }) {
  const t = useTranslations();
  const ref = refundGroupRef(row);
  return (
    <div className="flex flex-col items-start gap-0.5 leading-tight">
      <TextLink href={`/operations/orders/${row.order.id}`} className="whitespace-nowrap">
        {row.order.orderNumber}
      </TextLink>
      <span className="whitespace-nowrap text-xs text-muted">
        {fmtDate(row.order.createdAt)}
      </span>
      {ref?.kind === "trade" && (
        <TextLink
          href={`/operations/trades/${ref.tradeId}`}
          className="whitespace-nowrap text-xs"
        >
          {ref.number}
        </TextLink>
      )}
      {ref?.kind === "group" && (
        <span className="whitespace-nowrap text-xs text-muted">
          {t("admin.operations.refunds.cells.group", { number: ref.number })}
        </span>
      )}
    </div>
  );
}

/** Alıcı ve satıcı alt alta; kullanıcı kodu ikincil satırda. */
export function RefundPartiesCell({ row }: { row: AdminRefundRow }) {
  const t = useTranslations();
  const party = (
    role: string,
    p: AdminRefundRow["buyer"],
  ) => (
    <CellUser
      name={p.name}
      secondary={[role, p.code].filter(Boolean).join(" · ")}
      href={`/accounts/users/${p.id}`}
    />
  );
  return (
    <div className="flex flex-col gap-1.5">
      {party(t("admin.operations.common.buyer"), row.buyer)}
      {party(t("admin.operations.common.seller"), row.seller)}
    </div>
  );
}

/** Sipariş paketi ve iade kargosu takip numaraları + iade kargosu durumu. */
export function RefundCargoCell({ row }: { row: AdminRefundRow }) {
  const t = useTranslations();
  const ret = row.returnShipment;
  if (!row.order.packageTrackingNo && !ret) return DASH;
  return (
    <div className="flex flex-col items-start gap-0.5 leading-tight">
      {row.order.packageTrackingNo && (
        <span className="whitespace-nowrap text-xs text-muted">
          {t("admin.operations.refunds.cells.orderCargo")}{" "}
          <span className="font-mono text-body">
            {row.order.packageTrackingNo}
          </span>
        </span>
      )}
      {ret && (
        <>
          <span className="whitespace-nowrap text-xs text-muted">
            {t("admin.operations.refunds.cells.returnCargo")}{" "}
            <span className="font-mono text-body">{ret.trackingNo ?? "—"}</span>
          </span>
          {ret.status && (
            <Badge
              status={ret.status}
              config={statusConfig(shipmentStatusConfig, t)}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Takas deposu: varış, karar, çıkış tarihi + etiket bağlantısı, müşterilere dönüş. */
export function RefundWarehouseCell({ row }: { row: AdminRefundRow }) {
  const t = useTranslations();
  const w = row.warehouse;
  if (!w) return DASH;
  const line = (labelKey: Parameters<typeof t>[0], value: string | null) => (
    <span className="whitespace-nowrap text-xs text-muted">
      {t(labelKey)} <span className="text-body">{value ?? "—"}</span>
    </span>
  );
  return (
    <div className="flex flex-col items-start gap-0.5 leading-tight">
      {line("admin.operations.refunds.warehouse.arrival", w.arrivalStatus)}
      {line("admin.operations.refunds.warehouse.decision", w.decision)}
      <span className="whitespace-nowrap text-xs text-muted">
        {t("admin.operations.refunds.warehouse.outbound")}{" "}
        <span className="text-body">{fmtDate(w.outboundAt) ?? "—"}</span>
        {w.outboundLabelUrl && (
          <>
            {" "}
            <TextLink href={w.outboundLabelUrl} external>
              {t("admin.operations.refunds.warehouse.label")}
            </TextLink>
          </>
        )}
      </span>
      {line(
        "admin.operations.refunds.warehouse.returnToCustomers",
        w.returnToCustomersStatus,
      )}
    </div>
  );
}

/** İade nedeni etiketi + kısaltılmış not (tamamı ipucunda). */
export function RefundReasonCell({ row }: { row: AdminRefundRow }) {
  const t = useTranslations();
  const label =
    row.reason.label ??
    enumLabel(
      statusConfig(refundReasonConfig, t),
      row.reason.code,
      row.reason.code ?? "—",
    );
  const note = truncateNote(row.reason.note);
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <TruncatedText className="text-body">{label}</TruncatedText>
      {note && (
        <span
          className="truncate text-xs text-muted"
          title={row.reason.note ?? undefined}
        >
          {note}
        </span>
      )}
    </div>
  );
}

/** İade tutarı + para durumu rozeti + ödendiği an. */
export function RefundAmountCell({ row }: { row: AdminRefundRow }) {
  const t = useTranslations();
  const badge = MONEY_STATUS_BADGES[row.money.status];
  return (
    <div className="flex flex-col items-start gap-0.5 leading-tight">
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-danger-600">
        {fmtTry(row.money.refundAmount) ?? "—"}
      </span>
      <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
      {row.money.refundedAt && (
        <span className="whitespace-nowrap text-xs text-muted">
          {fmtDateTime(row.money.refundedAt)}
        </span>
      )}
    </div>
  );
}

/** İade talebi durumu + tamamlanma anı. */
export function RefundStatusCell({ row }: { row: AdminRefundRow }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col items-start gap-0.5 leading-tight">
      <Badge
        status={row.status}
        config={statusConfig(refundRequestStatusConfig, t)}
      />
      {row.completedAt && (
        <span className="whitespace-nowrap text-xs text-muted">
          {fmtDateTime(row.completedAt)}
        </span>
      )}
    </div>
  );
}

/** İade faturası: numara + mevcut admin fatura PDF indirmesi. */
export function RefundInvoiceCell({ row }: { row: AdminRefundRow }) {
  const invoice = row.returnInvoice;
  if (!invoice) return DASH;
  return (
    <div className="flex flex-col items-start leading-tight">
      <span className="whitespace-nowrap font-mono text-sm text-body">
        {invoice.number ?? "—"}
      </span>
      <InvoicePdfButton id={invoice.id} seller={false} />
    </div>
  );
}
