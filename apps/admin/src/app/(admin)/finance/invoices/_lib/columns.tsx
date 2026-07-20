/** @format */

import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { fmtTry } from "@/lib/format";
import { InvoicePdfButton } from "../_components/InvoicePdfButton";
import { type Invoice, type SellerInvoice, invoiceStatusConfig } from "./types";

export const elogoColumns = [
  col.custom<Invoice>(
    "Fatura No",
    (i) => (
      <div>
        <p className="whitespace-nowrap font-mono font-medium text-heading">
          {i.invoiceNumber || "—"}
        </p>
        <Badge variant={i.isReturn ? "danger" : "secondary"} size="sm">
          {i.documentTypeLabel}
        </Badge>
        {i.isReturn && i.billingReference && (
          <p className="mt-1 text-xs text-danger-600">
            İade → {i.billingReference}
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
  col.badge<Invoice>(
    "Tür",
    (i) => (
      <Badge variant={i.isReturn ? "danger" : "secondary"}>{i.typeLabel}</Badge>
    ),
    { sortKey: "type", sortType: "text" },
  ),
  col.user<Invoice>(
    "Alıcı",
    (i) => ({
      name: i.recipientName || "—",
      secondary: i.recipientVknTckn
        ? `VKN/TCKN: ${i.recipientVknTckn}`
        : undefined,
    }),
    { sortKey: "recipientName", sortType: "text" },
  ),
  col.custom<Invoice>(
    "Tutar",
    (i) => (
      <div className="whitespace-nowrap text-sm">
        <p className="font-medium text-heading">{fmtTry(i.total)}</p>
        <p className="text-xs text-muted">KDV: {fmtTry(i.taxAmount)}</p>
      </div>
    ),
    { align: "right", minWidth: 120, sortKey: "total", sortType: "number" },
  ),
  col.custom<Invoice>(
    "Durum",
    (i) => (
      <div>
        <Badge status={i.status} config={invoiceStatusConfig} />
        {i.status === "failed" && i.resultMsg && (
          <p className="mt-1 max-w-[200px] truncate text-xs text-danger-600">
            {i.resultMsg}
          </p>
        )}
      </div>
    ),
    { sortKey: "status", sortType: "text" },
  ),
  col.custom<Invoice>("Mail", (i) =>
    i.emailSentAt ? (
      <span className="text-success-600">Gönderildi</span>
    ) : (
      <span className="text-muted">—</span>
    ),
  ),
  col.date<Invoice>("Tarih", (i) => i.issuedAt || i.createdAt, {
    sortKey: "issuedAt",
    sortType: "date",
  }),
  col.custom<Invoice>("PDF", (i) =>
    i.hasPdf ? (
      <InvoicePdfButton id={i.id} seller={false} />
    ) : (
      <span className="text-xs text-muted">—</span>
    ),
  ),
];

export const sellerColumns = [
  col.custom<SellerInvoice>(
    "Sipariş",
    (s) => (
      <div className="text-sm">
        <p className="whitespace-nowrap font-mono font-medium text-heading">
          {s.orderNumber || "—"}
        </p>
        <p className="max-w-[220px] truncate text-xs text-muted">
          {s.fileName}
        </p>
        {s.replacedAt && (
          <span className="mt-1 inline-flex rounded bg-warning-100 px-2 py-0.5 text-[11px] font-medium text-warning-700">
            Değiştirildi
          </span>
        )}
      </div>
    ),
    { grow: 2, minWidth: 180 },
  ),
  col.text<SellerInvoice>("Satıcı", (s) => s.sellerName),
  col.user<SellerInvoice>("Alıcı", (s) => ({
    name: s.buyerName,
    secondary: s.buyerEmail,
  })),
  col.money<SellerInvoice>("Sipariş Tutarı", (s) => s.orderTotal),
  col.custom<SellerInvoice>("Mail", (s) =>
    s.emailSentAt ? (
      <span className="text-xs text-success-600">✓ Gönderildi</span>
    ) : (
      <span className="text-xs text-muted">—</span>
    ),
  ),
  col.date<SellerInvoice>("Yüklenme", "uploadedAt"),
  col.custom<SellerInvoice>("PDF", (s) => (
    <InvoicePdfButton id={s.id} seller />
  )),
];
