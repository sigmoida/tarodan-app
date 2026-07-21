/** @format */

import { Badge } from "@tarodan/ui";
import { col } from "@/components/table";
import { fmtTry } from "@/lib/format";
import { InvoicePdfButton } from "../_components/InvoicePdfButton";
import { type Invoice, type SellerInvoice, invoiceStatusConfig } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export const elogoColumns = (t: T) => [
  col.custom<Invoice>(
    t("admin.finance.invoices.invoiceNumber"),
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
  col.badge<Invoice>(
    t("admin.finance.invoices.type"),
    (i) => (
      <Badge variant={i.isReturn ? "danger" : "secondary"}>{i.typeLabel}</Badge>
    ),
    { sortKey: "type", sortType: "text" },
  ),
  col.user<Invoice>(
    t("admin.finance.common.buyer"),
    (i) => ({
      name: i.recipientName || "—",
      secondary: i.recipientVknTckn
        ? `VKN/TCKN: ${i.recipientVknTckn}`
        : undefined,
    }),
    { sortKey: "recipientName", sortType: "text" },
  ),
  col.custom<Invoice>(
    t("common.amount"),
    (i) => (
      <div className="whitespace-nowrap text-sm tabular-nums">
        <p className="font-medium text-heading">{fmtTry(i.total)}</p>
        <p className="text-xs text-muted">
          {t("admin.finance.common.vat")}: {fmtTry(i.taxAmount)}
        </p>
      </div>
    ),
    { align: "right", minWidth: 120, sortKey: "total", sortType: "number" },
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
  col.custom<Invoice>(
    t("admin.finance.common.mail"),
    (i) =>
      i.emailSentAt ? (
        <span className="text-success-600">
          {t("admin.finance.common.sent")}
        </span>
      ) : (
        <span className="text-muted">—</span>
      ),
    { sortKey: "emailSentAt", sortType: "date" },
  ),
  col.date<Invoice>(t("common.date"), (i) => i.issuedAt || i.createdAt, {
    sortKey: "issuedAt",
    sortType: "date",
  }),
  col.custom<Invoice>(
    "PDF",
    (i) =>
      i.hasPdf ? (
        <InvoicePdfButton id={i.id} seller={false} />
      ) : (
        <span className="text-xs text-muted">—</span>
      ),
    { sortKey: "hasPdf", sortType: "number" },
  ),
];

export const sellerColumns = (t: T) => [
  col.custom<SellerInvoice>(
    t("admin.finance.common.order"),
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
            {t("admin.finance.invoices.replaced")}
          </span>
        )}
      </div>
    ),
    { grow: 2, minWidth: 180, sortKey: "orderNumber" },
  ),
  col.text<SellerInvoice>(
    t("admin.finance.common.seller"),
    (s) => s.sellerName,
    {
      sortKey: "sellerName",
    },
  ),
  col.user<SellerInvoice>(
    t("admin.finance.common.buyer"),
    (s) => ({
      name: s.buyerName,
      secondary: s.buyerEmail,
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
