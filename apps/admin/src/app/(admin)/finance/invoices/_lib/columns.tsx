/** @format */

import { Badge, Button } from "@tarodan/ui";
import Link from "next/link";
import { col } from "@/components/table";
import { fmtTry } from "@/lib/format";
import { InvoicePdfButton } from "../_components/InvoicePdfButton";
import { InvoiceDetailButton } from "../_components/InvoiceDetailButton";
import { InvoiceEmailButton } from "../_components/InvoiceEmailButton";
import {
  type Invoice,
  type InvoiceParty,
  type SellerInvoice,
  documentTypeLabel,
  invoiceContextLabels,
  invoiceStatusConfig,
  invoiceTypeLabels,
} from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Taraf hücresi: ad + insan-okur kullanıcı kodu. Kod ADIN ALTINDA durur çünkü
 * taslakta kolon "Kullanıcı ID" ile aranıyor — operatör kodu görmeden hangi
 * kaydı aradığını yazamaz.
 */
const partyCell = (party: InvoiceParty | null) =>
  party
    ? {
        name: party.name,
        secondary: party.code || undefined,
        href: `/accounts/users/${party.id}`,
      }
    : { name: "—" };

export const elogoColumns = (
  t: T,
  // failed belgeler için retry aksiyonu (deneme sayacı sıfırlanır, cron alır).
  onRetry?: (invoice: Invoice) => void,
  retryingId?: string,
) => {
  const contexts = invoiceContextLabels(t);
  const types = invoiceTypeLabels(t);
  return [
    col.user<Invoice>(
      t("admin.finance.common.seller"),
      (i) => partyCell(i.seller),
      { sortKey: "sellerName", sortType: "text", minWidth: 200 },
    ),
    col.user<Invoice>(
      t("admin.finance.common.buyer"),
      (i) => partyCell(i.buyer),
      { sortKey: "buyerName", sortType: "text", minWidth: 200 },
    ),
    col.badge<Invoice>(
      t("admin.finance.invoices.context"),
      (i) =>
        i.context ? (
          <Badge variant="secondary">{contexts[i.context] ?? i.context}</Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
      { sortKey: "context", sortType: "text", minWidth: 140 },
    ),
    col.custom<Invoice>(
      t("admin.finance.invoices.invoiceNumber"),
      (i) => (
        <div>
          <p className="whitespace-nowrap font-mono font-medium text-heading">
            {i.invoiceNumber || "—"}
          </p>
          <Badge variant={i.isReturn ? "danger" : "secondary"} size="sm">
            {documentTypeLabel(t, i.documentType)}
          </Badge>
          {i.sourceReference && (
            <p className="mt-1 font-mono text-xs text-muted">
              {i.sourceReference}
            </p>
          )}
          {i.isReturn && i.billingReference && (
            <p className="mt-1 text-xs text-danger-600">
              {t("admin.finance.invoices.returnReference", {
                reference: i.billingReference,
              })}
            </p>
          )}
        </div>
      ),
      {
        grow: 2,
        minWidth: 150,
        sortKey: "invoiceNumber",
        sortType: "text",
      },
    ),
    // Açıklama = belgenin ÜSTÜNDE yazan metin; türün etiketi onun altında ikinci
    // satırdır. İkisi aynı şey değil: biri kayıt, öteki arayüz sözlüğü.
    col.custom<Invoice>(
      t("admin.finance.invoices.description"),
      (i) => (
        <div className="text-sm">
          <p className="font-medium text-heading">{i.description || "—"}</p>
          <p className="text-xs text-muted">{types[i.type] ?? i.type}</p>
        </div>
      ),
      {
        grow: 3,
        minWidth: 200,
        sortKey: "description",
        sortType: "text",
      },
    ),
    col.date<Invoice>(t("common.date"), (i) => i.issuedAt || i.createdAt, {
      sortKey: "issuedAt",
      sortType: "date",
    }),
    col.custom<Invoice>(
      t("admin.finance.invoices.totalWithVat"),
      (i) => (
        <div className="whitespace-nowrap text-sm tabular-nums">
          <p className="font-medium text-heading">{fmtTry(i.total)}</p>
          <p className="text-xs text-muted">
            {t("admin.finance.common.vat")}: {fmtTry(i.taxAmount)}
          </p>
          {i.discountTotal > 0 && (
            <p className="text-xs text-muted">
              {t("admin.finance.invoices.discount")}: {fmtTry(i.discountTotal)}
            </p>
          )}
        </div>
      ),
      { align: "right", minWidth: 130, sortKey: "total", sortType: "number" },
    ),
    col.custom<Invoice>(
      t("common.actions"),
      (i) =>
        i.hasPdf ? (
          <InvoicePdfButton id={i.id} seller={false} />
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
      { minWidth: 130, sortKey: "hasPdf", sortType: "number" },
    ),
    col.custom<Invoice>(
      t("admin.finance.invoices.detail"),
      (i) => <InvoiceDetailButton id={i.id} />,
      { minWidth: 140 },
    ),
    col.custom<Invoice>(
      t("common.status"),
      (i) => (
        <div>
          <Badge status={i.status} config={invoiceStatusConfig(t)} />
          {i.status === "failed" && i.resultMsg && (
            <p className="mt-1 max-w-[200px] truncate text-xs text-danger-600">
              {i.resultMsg}
            </p>
          )}
        </div>
      ),
      { sortKey: "status", sortType: "text" },
    ),
    // "İşleme al": belgenin durumu hangi müdahaleyi mümkün kılıyorsa o. Kesilmiş
    // belge yeniden postalanır, tükenmiş belge yeniden kuyruğa alınır — ikisi
    // aynı anda geçerli olamaz, o yüzden tek kolon.
    col.actions<Invoice>(
      (i) =>
        i.status === "failed" ? (
          onRetry ? (
            <Button
              size="sm"
              variant="secondary"
              isLoading={retryingId === i.id}
              onClick={() => onRetry(i)}
            >
              {t("admin.finance.invoices.retry")}
            </Button>
          ) : null
        ) : (
          <InvoiceEmailButton invoice={i} />
        ),
      { header: t("admin.finance.invoices.handling"), minWidth: 150 },
    ),
  ];
};

export const sellerColumns = (t: T) => [
  col.custom<SellerInvoice>(
    t("admin.finance.common.order"),
    (s) => (
      <div className="text-sm">
        {s.orderId ? (
          <Link
            href={`/operations/orders/${s.orderId}`}
            className="whitespace-nowrap font-mono font-medium text-primary-600 hover:text-primary-700"
          >
            #{s.orderNumber}
          </Link>
        ) : (
          <p className="whitespace-nowrap font-mono font-medium text-heading">
            {s.orderNumber || "—"}
          </p>
        )}
        <p className="max-w-[220px] truncate text-xs text-muted">
          {s.fileName}
        </p>
        {s.replacedAt && (
          <span className="mt-1 inline-flex rounded bg-warning-100 px-2 py-0.5 text-[11px] font-medium text-warning-700">
            {t("admin.finance.invoices.replaced")}
          </span>
        )}
      </div>
    ),
    { grow: 2, minWidth: 180, sortKey: "orderNumber" },
  ),
  col.user<SellerInvoice>(
    t("admin.finance.common.seller"),
    (s) => ({
      name: s.sellerName,
      secondary: s.sellerEmail,
      href: s.sellerId ? `/accounts/users/${s.sellerId}` : undefined,
    }),
    {
      sortKey: "sellerName",
    },
  ),
  col.user<SellerInvoice>(
    t("admin.finance.common.buyer"),
    (s) => ({
      name: s.buyerName,
      secondary: s.buyerEmail,
      href: s.buyerId ? `/accounts/users/${s.buyerId}` : undefined,
    }),
    { sortKey: "buyerName" },
  ),
  col.money<SellerInvoice>(
    t("admin.finance.invoices.orderAmount"),
    (s) => s.orderTotal,
    { sortKey: "orderTotal" },
  ),
  col.custom<SellerInvoice>(
    t("admin.finance.common.mail"),
    (s) =>
      s.emailSentAt ? (
        <span className="text-xs text-success-600">
          ✓ {t("admin.finance.common.sent")}
        </span>
      ) : (
        <span className="text-xs text-muted">—</span>
      ),
    { sortKey: "emailSentAt", sortType: "date" },
  ),
  col.date<SellerInvoice>(t("admin.finance.invoices.uploadedAt"), "uploadedAt"),
  col.custom<SellerInvoice>("PDF", (s) => (
    <InvoicePdfButton id={s.id} seller />
  )),
];
