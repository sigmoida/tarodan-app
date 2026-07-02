"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { Button, Input, Select, StatusBadge } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { useAdminResource } from "@/hooks/useAdminResource";
import { shipmentStatusConfig, statusOptions, formatRelative } from "./_shared";

// ─── Tip ─────────────────────────────────────────────────────────────────────
interface SuratShipmentRow {
  id: string;
  provider: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  providerStatusCode: number | null;
  providerRawStatus: string | null;
  updatedAt: string;
  order?: {
    id: string;
    orderNumber: string;
    buyer?: { id: string; displayName: string } | null;
  } | null;
}

export function SuratTrackingTab() {
  const router = useRouter();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [cref, setCref] = useState("");
  const [opLoading, setOpLoading] = useState<null | "track" | "cancel">(null);
  const [opResult, setOpResult] = useState<any>(null);
  const [barcoding, setBarcoding] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<any>(null);

  const {
    rows,
    total,
    page,
    setPage,
    totalPages,
    filters,
    setFilter,
    isLoading,
    refetch,
  } = useAdminResource<SuratShipmentRow>({
    queryKey: "surat-shipments",
    // Yalnızca Sürat kargolarını getir (provider = surat → carrierId).
    fetcher: (params) => adminApi.getShipments({ ...params, carrierId: "surat" }),
    limit: 20,
    initialFilters: { status: "all" },
    errorMessage: "Sürat kargoları yüklenemedi",
  });

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      const res = await adminApi.syncShipmentTracking(id);
      const data = res.data;
      if (data?.ok) {
        toast.success(data.message || "Takip güncellendi");
      } else {
        toast(data?.message || "Sürat'tan güncelleme alınamadı");
      }
      refetch();
    } catch {
      toast.error("Takip senkronu başarısız oldu");
    } finally {
      setSyncingId(null);
    }
  }

  async function runEndpointTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.suratEndpointTest();
      setTestResult(res.data);
      if (res.data?.ref) setCref(res.data.ref);
    } catch (e: any) {
      setTestResult({
        error: e?.response?.data?.message || e?.message || "İstek başarısız oldu",
      });
    } finally {
      setTesting(false);
    }
  }

  async function runOp(op: "track" | "cancel") {
    const r = cref.trim();
    if (!r) {
      toast.error("Önce bir referans gir (veya 'Gönderi Oluştur + Takip' ile üret)");
      return;
    }
    setOpLoading(op);
    setOpResult(null);
    try {
      const res =
        op === "track"
          ? await adminApi.suratTestTrack(r)
          : await adminApi.suratTestCancel(r);
      setOpResult(res.data);
    } catch (e: any) {
      setOpResult({
        error: e?.response?.data?.message || e?.message || "İstek başarısız oldu",
      });
    } finally {
      setOpLoading(null);
    }
  }

  async function runBarcode() {
    setBarcoding(true);
    setBarcodeResult(null);
    try {
      const res = await adminApi.suratTestBarcode();
      setBarcodeResult(res.data);
      if (res.data?.ref) setCref(res.data.ref);
    } catch (e: any) {
      setBarcodeResult({
        error: e?.response?.data?.message || e?.message || "İstek başarısız oldu",
      });
    } finally {
      setBarcoding(false);
    }
  }

  const columns: ColumnDef<SuratShipmentRow, any>[] = [
    {
      header: "Sipariş",
      cell: ({ row }) =>
        row.original.order ? (
          <Link
            href={`/orders/${row.original.order.id}`}
            className="font-medium text-primary-600 hover:underline"
          >
            #{row.original.order.orderNumber}
          </Link>
        ) : (
          <span className="text-subtle text-sm">—</span>
        ),
    },
    {
      header: "Alıcı",
      cell: ({ row }) => (
        <span className="text-heading">
          {row.original.order?.buyer?.displayName || "—"}
        </span>
      ),
    },
    {
      header: "Takip No",
      cell: ({ row }) =>
        row.original.trackingNumber ? (
          row.original.trackingUrl ? (
            <a
              href={row.original.trackingUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-xs text-primary-600 hover:underline"
            >
              {row.original.trackingNumber}
            </a>
          ) : (
            <span className="font-mono text-xs text-body">
              {row.original.trackingNumber}
            </span>
          )
        ) : (
          <span className="text-subtle text-sm">—</span>
        ),
    },
    {
      header: "Sürat Durumu",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <StatusBadge
            status={(row.original.status || "").toLowerCase()}
            config={shipmentStatusConfig}
          />
          {row.original.providerRawStatus ? (
            <span className="text-xs text-muted">
              {row.original.providerRawStatus}
              {row.original.providerStatusCode != null
                ? ` (${row.original.providerStatusCode})`
                : ""}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      header: "Son Güncelleme",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted">
          {row.original.updatedAt ? formatRelative(row.original.updatedAt) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          disabled={syncingId === row.original.id}
          onClick={(e) => {
            e.stopPropagation();
            handleSync(row.original.id);
          }}
        >
          {syncingId === row.original.id ? "Yenileniyor…" : "Takibi Yenile"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Sürat Endpoint Test Konsolu ──────────────────────────────────── */}
      <div className="admin-card space-y-4 p-4">
        <div>
          <h3 className="font-medium text-heading">Sürat Endpoint Test Konsolu</h3>
          <p className="text-xs text-muted">
            Elimizdeki Sürat REST endpoint&apos;lerini buradan test et. Sunucu → Sürat
            gerçek istek atar; DB&apos;ye/siparişe dokunmaz.
          </p>
        </div>

        {/* 1) Hızlı test: gönderi oluştur + takip / barkod */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted">
            Yeni bir test gönderisi oluşturur; referansı aşağı doldurur.
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              isLoading={testing}
              onClick={runEndpointTest}
            >
              {testing ? "Test ediliyor…" : "Gönderi Oluştur + Takip"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              isLoading={barcoding}
              onClick={runBarcode}
            >
              {barcoding ? "Üretiliyor…" : "Barkod/Etiket Üret"}
            </Button>
          </div>
        </div>

        {testResult && (
          <div className="space-y-2 rounded-lg bg-surface-alt p-3 font-mono text-xs">
            {testResult.error ? (
              <div className="text-danger-600">Hata: {String(testResult.error)}</div>
            ) : (
              <>
                <div>
                  Referans: <span className="text-body">{testResult.ref}</span>
                </div>
                <div>
                  1) Gönderi oluştur:{" "}
                  <span
                    className={
                      testResult.create?.ok ? "text-success-600" : "text-danger-600"
                    }
                  >
                    {testResult.create?.ok ? "✓ başarılı" : "✗ hata"}
                  </span>{" "}
                  — {testResult.create?.message}
                </div>
                <div>
                  2) Takip sorgula:{" "}
                  {testResult.track?.error ? (
                    <span className="text-danger-600">✗ {testResult.track.error}</span>
                  ) : (
                    <span className="text-body">
                      HTTP {testResult.track?.httpStatus} · IsError=
                      {String(testResult.track?.isError)} ·{" "}
                      {testResult.track?.durum ||
                        testResult.track?.message ||
                        "—"}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {barcodeResult && (
          <div className="space-y-1 rounded-lg bg-surface-alt p-3 font-mono text-xs">
            {barcodeResult.error ? (
              <div className="text-danger-600">
                Barkod hatası: {String(barcodeResult.error)}
              </div>
            ) : (
              <>
                <div>
                  Barkod (OrtakBarkodOlustur):{" "}
                  <span
                    className={barcodeResult.ok ? "text-success-600" : "text-danger-600"}
                  >
                    {barcodeResult.ok ? "✓ üretildi" : "✗ hata"}
                  </span>{" "}
                  — {barcodeResult.message}
                </div>
                <div>
                  KargoTakipNo:{" "}
                  <span className="text-body">{barcodeResult.kargoTakipNo || "—"}</span>
                </div>
                {barcodeResult.barcodeSample && (
                  <div className="text-subtle">
                    ZPL etiket ({barcodeResult.barcodeCount} parça):{" "}
                    {barcodeResult.barcodeSample}…
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 2) Referansla tekil endpoint testleri (takip / geri-çek) */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted">
            Bir referans (OzelKargoTakipNo) ile tekil endpoint testi:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={cref}
              onChange={(e) => setCref(e.target.value)}
              placeholder="Referans (OzelKargoTakipNo)"
              className="w-full font-mono text-xs sm:w-72"
            />
            <Button
              variant="outline"
              size="sm"
              isLoading={opLoading === "track"}
              onClick={() => runOp("track")}
            >
              Takip Sorgula
            </Button>
            <Button
              variant="outline"
              size="sm"
              isLoading={opLoading === "cancel"}
              onClick={() => runOp("cancel")}
            >
              Geri Çek (İptal)
            </Button>
          </div>
          {opResult && (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-alt p-3 font-mono text-xs text-body">
              {JSON.stringify(opResult, null, 2)}
            </pre>
          )}
        </div>

        <p className="text-xs text-subtle">
          Not: Test ortamında gönderiler fiziksel &quot;kabul&quot; aşamasına gelmediği için
          takip/iptal genelde &quot;kabul bekleniyor / Kayıt Bulunamadı&quot; döner; barkod ise
          gerçek KargoTakipNo + ZPL etiket üretir. Üretimde hepsi tam çalışır.
        </p>
      </div>

      <p className="text-sm text-muted">
        Sürat Kargo gönderilerinin canlı durumu. Durumlar arka planda her 30 dakikada
        bir otomatik senkronlanır; anlık güncel durum için satırdaki{" "}
        <span className="font-medium text-body">Takibi Yenile</span> düğmesini kullanın.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row">
        <Select
          value={filters.status ?? "all"}
          onChange={(e) => setFilter("status", e.target.value)}
          className="sm:w-56"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyText="Sürat kargosu bulunamadı"
        getRowId={(r) => r.id}
        onRowClick={(r) => r.order && router.push(`/orders/${r.order.id}`)}
        rowClassName={(r) => (r.order ? undefined : "cursor-default")}
      />

      <p className="text-sm text-muted">Toplam {total} Sürat gönderisi</p>
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
