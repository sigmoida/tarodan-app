"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { Button, Select } from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";
import { useMemo } from "react";
import toast from "react-hot-toast";

// ─── Tipler ────────────────────────────────────────────────────────────────

interface AiCheckItem {
  id: string;
  title: string;
  status: string;
  imageUrl?: string | null;
  seller?: { id: string; displayName: string; email: string };
  aiCheckStatus?: string | null;
  aiRelevanceScore?: number | null;
  aiNsfwScore?: number | null;
  aiCheckReason?: string | null;
  aiCheckedAt?: string | null;
}

// ─── Yardımcı: AI rozeti ───────────────────────────────────────────────────

function aiBadge(s?: string | null) {
  const [cls, label] =
    s === "flagged"
      ? ["bg-danger-500/20 text-danger-600", "Uygunsuz şüphesi"]
      : s === "review"
        ? ["bg-warning-500/20 text-warning-700", "Düşük ilgililik"]
        : ["bg-success-500/20 text-success-700", "Temiz · oto-onay"];
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function AiModerationPage() {
  // ── Görsel Test Et aracı ───────────────────────────────────────────────────
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // ── Kabul eşiği (ilgililik %) ──────────────────────────────────────────────
  const [relThreshold, setRelThreshold] = useState(20);
  const [savingCfg, setSavingCfg] = useState(false);

  useEffect(() => {
    adminApi
      .get("/admin/moderation/ai-config")
      .then((res) =>
        setRelThreshold(
          Math.round((res.data?.relevanceThreshold ?? 0.2) * 100),
        ),
      )
      .catch(() => {});
  }, []);

  const saveThreshold = async () => {
    setSavingCfg(true);
    try {
      await adminApi.post("/admin/moderation/ai-config", {
        relevanceThreshold: relThreshold / 100,
      });
      toast.success(`Kabul eşiği %${relThreshold} olarak kaydedildi`);
    } catch {
      toast.error("Eşik kaydedilemedi (AI servisi kapalı olabilir)");
    } finally {
      setSavingCfg(false);
    }
  };

  const runTest = async (override?: string) => {
    const url = (override ?? testUrl).trim();
    if (!url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.post("/admin/moderation/test-image", {
        imageUrl: url,
      });
      setTestResult(res.data);
    } catch {
      toast.error("Test başarısız (görsel indirilemedi olabilir)");
    } finally {
      setTesting(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setTestUrl(dataUrl);
      runTest(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Liste verisi (useAdminResource) ───────────────────────────────────────
  const {
    rows: items,
    total,
    page,
    setPage,
    totalPages,
    filters,
    setFilter,
    isLoading,
  } = useAdminResource<AiCheckItem>({
    queryKey: "ai-checks",
    fetcher: (params) => {
      const { status, ...rest } = params;
      return adminApi.get("/admin/moderation/ai-checks", {
        params: { ...rest, status: status || undefined, pageSize: rest.limit },
      });
    },
    limit: 20,
    initialFilters: { status: "" },
    errorMessage: "AI denetim listesi yüklenemedi",
  });

  // ── Kolon tanımları ────────────────────────────────────────────────────────

  const columns: ColumnDef<AiCheckItem, any>[] = useMemo(
    () => [
      {
        header: "Görsel",
        cell: ({ row }) =>
          row.original.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.original.imageUrl}
              alt={row.original.title}
              className="w-12 h-12 rounded object-cover shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-surface-alt shrink-0" />
          ),
      },
      {
        header: "Ürün",
        cell: ({ row }) => (
          <Link
            href={`/products/${row.original.id}`}
            className="text-heading hover:text-primary-400 line-clamp-1"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        header: "AI Sonuç",
        cell: ({ row }) => aiBadge(row.original.aiCheckStatus),
      },
      {
        header: "İlgililik",
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap">
            %{Math.round((row.original.aiRelevanceScore ?? 0) * 100)}
          </span>
        ),
      },
      {
        header: "Uygunsuzluk",
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap">
            %{((row.original.aiNsfwScore ?? 0) * 100).toFixed(2)}
          </span>
        ),
      },
      {
        header: "Ürün Durumu",
        cell: ({ row }) => (
          <span className="text-sm text-muted">{row.original.status}</span>
        ),
      },
      {
        header: "Satıcı",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.seller?.displayName || "-"}
          </span>
        ),
      },
      {
        header: "Denetim",
        cell: ({ row }) => (
          <span className="text-xs text-muted whitespace-nowrap">
            {row.original.aiCheckedAt
              ? new Date(row.original.aiCheckedAt).toLocaleString("tr-TR")
              : "-"}
          </span>
        ),
      },
    ],
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Görsel Test Et aracı */}
      <div className="admin-card p-4 space-y-3">
        <h3 className="font-medium text-heading">
          Görsel Test Et (ürün oluşturmadan skor gör)
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runTest()}
            placeholder="Görsel URL'i (https://...) veya data:image/...;base64,..."
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-surface text-sm"
          />
          <Button onClick={() => runTest()} disabled={testing || !testUrl.trim()}>
            {testing ? "Test ediliyor..." : "Test Et"}
          </Button>
        </div>
        <label className="inline-flex items-center gap-1 text-sm text-muted cursor-pointer">
          veya{" "}
          <span className="text-primary-500 underline">
            bilgisayardan dosya seç
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
        </label>
        {testResult && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
            {testUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={testUrl}
                alt="test"
                className="w-16 h-16 rounded object-cover shrink-0"
              />
            )}
            {testResult.error || testResult.enabled === false ? (
              <span className="text-sm text-danger-600">
                {testResult.error || testResult.message}
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {aiBadge(
                  testResult.decision === "flag"
                    ? "flagged"
                    : testResult.decision === "review"
                      ? "review"
                      : "passed",
                )}
                <span className="text-sm">
                  İlgililik: %
                  {Math.round((testResult.relevanceScore ?? 0) * 100)} ·
                  Uygunsuzluk: %
                  {((testResult.nsfwScore ?? 0) * 100).toFixed(2)}
                </span>
                <span className="text-xs text-muted">
                  Etiketler:{" "}
                  {(testResult.topLabels || [])
                    .slice(0, 3)
                    .map((l: { label: string }) => l.label)
                    .join(", ")}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kabul Eşiği */}
      <div className="admin-card p-4 space-y-3">
        <h3 className="font-medium text-heading">Kabul Eşiği (ilgililik %)</h3>
        <p className="text-sm text-muted">
          Ürün görseli bu yüzdenin üstünde ilgililik alırsa otomatik kabul
          edilir; altındakiler admin onayına düşer. Düşürürsen daha çok ürün
          oto-onaylanır, yükseltirsen daha çok admine gelir.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={relThreshold}
            onChange={(e) => setRelThreshold(Number(e.target.value))}
            className="flex-1 min-w-[200px] accent-primary-500"
          />
          <span className="font-semibold text-heading w-12 text-right">
            %{relThreshold}
          </span>
          <Button onClick={saveThreshold} disabled={savingCfg}>
            {savingCfg ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>

      {/* AI denetim listesi */}
      <ResourceListPage<AiCheckItem>
        title="AI Denetim"
        description={`AI ile denetlenmiş ${total} ürün`}
        filters={
          <Select
            value={filters.status ?? ""}
            onChange={(e) => {
              setFilter("status", e.target.value);
            }}
            className="sm:w-56"
          >
            <option value="">Tümü</option>
            <option value="passed">Temiz (oto-onaylanan)</option>
            <option value="review">Düşük ilgililik (admin incelemesi)</option>
            <option value="flagged">Uygunsuz şüphesi</option>
          </Select>
        }
        columns={columns}
        data={items}
        loading={isLoading}
        emptyText="AI ile denetlenmiş ürün yok"
        getRowId={(r) => r.id}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
