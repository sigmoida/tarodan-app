"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { Input, Select } from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";

interface Invoice {
  id: string;
  type: string;
  typeLabel: string;
  isReturn: boolean;
  status: string;
  documentType: string;
  documentTypeLabel: string;
  invoiceNumber: string | null;
  ettn: string | null;
  recipientName: string | null;
  recipientVknTckn: string | null;
  netAmount: number;
  taxAmount: number;
  total: number;
  vatRate: number;
  billingReference: string | null;
  hasPdf: boolean;
  emailSentAt: string | null;
  resultMsg: string | null;
  issuedAt: string | null;
  createdAt: string;
}

// Kurumsal satıcının elle yüklediği ürün faturası (eLogo gelir faturasından ayrı)
interface SellerInvoice {
  id: string;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  replacedAt: string | null;
  emailSentAt: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderTotal: number | null;
  sellerName: string;
  buyerName: string;
  buyerEmail: string | null;
}

// ElogoInvoiceStatus → rozet
const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Bekliyor", color: "text-warning-600", bg: "bg-warning-100" },
  sent: { label: "Kesildi", color: "text-success-600", bg: "bg-success-100" },
  signed: { label: "İmzalandı", color: "text-info-600", bg: "bg-info-100" },
  failed: { label: "Başarısız", color: "text-danger-600", bg: "bg-danger-100" },
  cancelled: { label: "İptal", color: "text-muted", bg: "bg-surface-alt" },
};

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "commission", label: "Komisyon" },
  { value: "service_fee", label: "Hizmet Bedeli" },
  { value: "membership", label: "Üyelik" },
  { value: "boost", label: "Öne Çıkarma" },
  { value: "trade_commission", label: "Takas Komisyonu" },
  { value: "platform_sale", label: "Platform Satışı" },
  { value: "return_invoice", label: "İade Faturası" },
];

const TABS = [
  { key: "elogo", label: "eLogo Faturaları" },
  { key: "seller", label: "Satıcı Faturaları" },
];

function mapInvoices(raw: any[]): Invoice[] {
  return (raw || []).map((r: any) => ({
    id: r.id,
    type: r.type,
    typeLabel: r.typeLabel,
    isReturn: !!r.isReturn,
    status: r.status,
    documentType: r.documentType,
    documentTypeLabel: r.documentTypeLabel,
    invoiceNumber: r.invoiceNumber,
    ettn: r.ettn,
    recipientName: r.recipientName,
    recipientVknTckn: r.recipientVknTckn,
    netAmount: Number(r.netAmount || 0),
    taxAmount: Number(r.taxAmount || 0),
    total: Number(r.total || 0),
    vatRate: Number(r.vatRate || 0),
    billingReference: r.billingReference,
    hasPdf: !!r.hasPdf,
    emailSentAt: r.emailSentAt,
    resultMsg: r.resultMsg,
    issuedAt: r.issuedAt,
    createdAt: r.createdAt,
  }));
}

function mapSellerInvoices(raw: any[]): SellerInvoice[] {
  return (raw || []).map((r: any) => ({
    id: r.id,
    fileName: r.fileName,
    fileSize: r.fileSize != null ? Number(r.fileSize) : null,
    uploadedAt: r.uploadedAt,
    replacedAt: r.replacedAt,
    emailSentAt: r.emailSentAt,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    orderTotal: r.orderTotal != null ? Number(r.orderTotal) : null,
    sellerName: r.sellerName,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
  }));
}

const fmtTL = (n: number) =>
  "₺" + n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminInvoicesPage() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") === "seller" ? "seller" : "elogo";
  const isSeller = activeTab === "seller";

  const {
    rows: rawRows,
    total,
    page,
    setPage,
    totalPages,
    search,
    setSearch,
    onSearchSubmit,
    filters,
    setFilter,
    isLoading,
    setTabUrl,
  } = useAdminResource<any>({
    queryKey: isSeller ? "seller-invoices" : "invoices",
    fetcher: (params) =>
      isSeller ? adminApi.getSellerInvoices(params) : adminApi.getInvoices(params),
    limit: 20,
    syncUrl: true,
    initialFilters: isSeller
      ? { startDate: "", endDate: "" }
      : { type: "", status: "", documentType: "", startDate: "", endDate: "" },
    errorMessage: "Faturalar yüklenemedi",
  });

  const invoices: Invoice[] = useMemo(
    () => (isSeller ? [] : mapInvoices(rawRows)),
    [isSeller, rawRows],
  );
  const sellerInvoices: SellerInvoice[] = useMemo(
    () => (isSeller ? mapSellerInvoices(rawRows) : []),
    [isSeller, rawRows],
  );
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (id: string, seller: boolean) => {
    setDownloadingId(id);
    try {
      const res = seller
        ? await adminApi.getSellerInvoicePdf(id)
        : await adminApi.getInvoicePdf(id);
      const url = (res.data as any)?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      /* api interceptor toast gösterir */
    } finally {
      setDownloadingId(null);
    }
  };

  const columns: ColumnDef<Invoice, any>[] = [
    {
      header: "Fatura No",
      cell: ({ row }) => (
        <div className="text-sm">
          <p className="font-mono font-medium text-heading whitespace-nowrap">
            {row.original.invoiceNumber || "—"}
          </p>
          <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded text-[11px] font-medium text-muted bg-surface-alt">
            {row.original.documentTypeLabel}
          </span>
          {row.original.isReturn && row.original.billingReference && (
            <p className="text-xs text-danger-600 mt-1">
              İade → {row.original.billingReference}
            </p>
          )}
        </div>
      ),
    },
    {
      header: "Tür",
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
            row.original.isReturn
              ? "text-danger-600 bg-danger-100"
              : "text-heading bg-surface-alt"
          }`}
        >
          {row.original.typeLabel}
        </span>
      ),
    },
    {
      header: "Alıcı",
      cell: ({ row }) => (
        <div className="text-sm">
          <p className="font-medium text-heading">{row.original.recipientName || "—"}</p>
          {row.original.recipientVknTckn && (
            <p className="text-muted text-xs">VKN/TCKN: {row.original.recipientVknTckn}</p>
          )}
        </div>
      ),
    },
    {
      header: "Tutar",
      cell: ({ row }) => (
        <div className="text-sm whitespace-nowrap">
          <p className="font-medium text-heading">{fmtTL(row.original.total)}</p>
          <p className="text-muted text-xs">KDV: {fmtTL(row.original.taxAmount)}</p>
        </div>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => {
        const info = statusConfig[row.original.status] || statusConfig.pending;
        return (
          <div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${info.color} ${info.bg}`}
            >
              {info.label}
            </span>
            {row.original.status === "failed" && row.original.resultMsg && (
              <p className="text-xs text-danger-600 mt-1 max-w-[200px] truncate">
                {row.original.resultMsg}
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: "Mail",
      cell: ({ row }) =>
        row.original.emailSentAt ? (
          <span className="text-xs text-success-600">✓ Gönderildi</span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {fmtDate(row.original.issuedAt || row.original.createdAt)}
        </span>
      ),
    },
    {
      header: "PDF",
      cell: ({ row }) =>
        row.original.hasPdf ? (
          <button
            type="button"
            onClick={() => handleDownload(row.original.id, false)}
            disabled={downloadingId === row.original.id}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 disabled:opacity-50"
            title="Faturayı indir/görüntüle"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {downloadingId === row.original.id ? "..." : "İndir"}
          </button>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
  ];

  const sellerColumns: ColumnDef<SellerInvoice, any>[] = [
    {
      header: "Sipariş",
      cell: ({ row }) => (
        <div className="text-sm">
          <p className="font-mono font-medium text-heading whitespace-nowrap">
            {row.original.orderNumber || "—"}
          </p>
          <p className="text-muted text-xs truncate max-w-[220px]">{row.original.fileName}</p>
          {row.original.replacedAt && (
            <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded text-[11px] font-medium text-warning-600 bg-warning-100">
              Değiştirildi
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Satıcı",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-heading">{row.original.sellerName}</span>
      ),
    },
    {
      header: "Alıcı",
      cell: ({ row }) => (
        <div className="text-sm">
          <p className="font-medium text-heading">{row.original.buyerName}</p>
          {row.original.buyerEmail && (
            <p className="text-muted text-xs">{row.original.buyerEmail}</p>
          )}
        </div>
      ),
    },
    {
      header: "Sipariş Tutarı",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-heading whitespace-nowrap">
          {row.original.orderTotal != null ? fmtTL(row.original.orderTotal) : "—"}
        </span>
      ),
    },
    {
      header: "Mail",
      cell: ({ row }) =>
        row.original.emailSentAt ? (
          <span className="text-xs text-success-600">✓ Gönderildi</span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      header: "Yüklenme",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {fmtDate(row.original.uploadedAt)}
        </span>
      ),
    },
    {
      header: "PDF",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => handleDownload(row.original.id, true)}
          disabled={downloadingId === row.original.id}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 disabled:opacity-50"
          title="Faturayı indir/görüntüle"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          {downloadingId === row.original.id ? "..." : "İndir"}
        </button>
      ),
    },
  ];

  const elogoFilters = (
    <>
      <Select
        value={filters.type ?? ""}
        onChange={(e) => setFilter("type", e.target.value)}
        className="sm:w-44"
      >
        <option value="">Tüm Türler</option>
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      <Select
        value={filters.status ?? ""}
        onChange={(e) => setFilter("status", e.target.value)}
        className="sm:w-40"
      >
        <option value="">Tüm Durumlar</option>
        <option value="sent">Kesildi</option>
        <option value="signed">İmzalandı</option>
        <option value="pending">Bekliyor</option>
        <option value="failed">Başarısız</option>
        <option value="cancelled">İptal</option>
      </Select>

      <Select
        value={filters.documentType ?? ""}
        onChange={(e) => setFilter("documentType", e.target.value)}
        className="sm:w-36"
      >
        <option value="">Tüm Belgeler</option>
        <option value="EARCHIVE">e-Arşiv</option>
        <option value="EINVOICE">e-Fatura</option>
      </Select>

      <Input
        type="date"
        value={filters.startDate ?? ""}
        onChange={(e) => setFilter("startDate", e.target.value)}
        className="sm:w-40"
      />

      <Input
        type="date"
        value={filters.endDate ?? ""}
        onChange={(e) => setFilter("endDate", e.target.value)}
        className="sm:w-40"
      />
    </>
  );

  const sellerFilters = (
    <>
      <Input
        type="date"
        value={filters.startDate ?? ""}
        onChange={(e) => setFilter("startDate", e.target.value)}
        className="sm:w-40"
      />
      <Input
        type="date"
        value={filters.endDate ?? ""}
        onChange={(e) => setFilter("endDate", e.target.value)}
        className="sm:w-40"
      />
    </>
  );

  return (
    <ResourceListPage<any>
      title="Faturalar"
      description={
        isSeller
          ? `Toplam ${total} satıcı yüklemesi fatura`
          : `Toplam ${total} e-Arşiv / e-Fatura belgesi`
      }
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(key) => setTabUrl(key, { defaultTab: "elogo", resetFilters: true, resetSearch: true })}
      search={{
        placeholder: isSeller
          ? "Sipariş no, satıcı, alıcı veya dosya ara..."
          : "Fatura no, alıcı, VKN veya ETTN ara...",
      }}
      searchValue={search}
      onSearchChange={setSearch}
      onSearchSubmit={onSearchSubmit}
      filters={isSeller ? sellerFilters : elogoFilters}
      columns={isSeller ? (sellerColumns as any) : (columns as any)}
      data={isSeller ? sellerInvoices : invoices}
      loading={isLoading}
      emptyText="Fatura bulunamadı"
      getRowId={(i: any) => i.id}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
