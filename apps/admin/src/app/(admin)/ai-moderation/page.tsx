"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import { Button } from "@tarodan/ui";
import { PageHeader } from "@/components/admin-list";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import toast from "react-hot-toast";

// ─── Yardımcı: AI sonuç rozeti (görsel test çıktısı için) ───────────────────

function aiBadge(s?: string | null) {
  const [cls, label] =
    s === "flagged"
      ? ["bg-danger-500/20 text-danger-600", "Uygunsuz şüphesi"]
      : s === "review"
        ? ["bg-warning-500/20 text-warning-700", "Düşük ilgililik"]
        : ["bg-success-500/20 text-success-700", "Temiz · oto-onay"];
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${cls}`}>{label}</span>
  );
}

// ─── Sayfa (Sistem → AI Denetim) ─────────────────────────────────────────────

export default function AiModerationPage() {
  // ── Görsel Test Et aracı ───────────────────────────────────────────────────
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // ── Eşikler (ilgililik + uygunsuzluk %) ────────────────────────────────────
  const [enabled, setEnabled] = useState(true);
  const [relThreshold, setRelThreshold] = useState(20);
  const [nsfwThreshold, setNsfwThreshold] = useState(70);
  const [savingCfg, setSavingCfg] = useState(false);

  useEffect(() => {
    adminApi
      .get("/admin/moderation/ai-config")
      .then((res) => {
        setEnabled(res.data?.enabled !== false);
        setRelThreshold(Math.round((res.data?.relevanceThreshold ?? 0.2) * 100));
        setNsfwThreshold(Math.round((res.data?.nsfwThreshold ?? 0.7) * 100));
      })
      .catch(() => {});
  }, []);

  const saveThresholds = async () => {
    setSavingCfg(true);
    try {
      await adminApi.post("/admin/moderation/ai-config", {
        relevanceThreshold: relThreshold / 100,
        nsfwThreshold: nsfwThreshold / 100,
      });
      toast.success("Eşikler kaydedildi");
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Denetim"
        description="Tüm varlıklar (ürün · kullanıcı · koleksiyon · görsel · metin) için ortak AI moderasyonu — eşikler, görsel testi ve birleşik olay günlüğü"
      />

      {!enabled && (
        <div className="admin-card p-4 text-sm text-warning-700 bg-warning-500/10">
          AI moderasyon servisi kapalı (AI_MODERATION_ENABLED=false). Eşik ayarı
          ve görsel testi devre dışı; geçmiş günlük kayıtları yine listelenir.
        </div>
      )}

      {/* Görsel Test Et aracı */}
      <div className="admin-card p-4 space-y-3">
        <h3 className="font-medium text-heading">
          Görsel Test Et (yükleme yapmadan skor gör)
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

      {/* AI Eşikleri */}
      <div className="admin-card p-4 space-y-4">
        <h3 className="font-medium text-heading">AI Eşikleri</h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-heading">
              Kabul eşiği (ilgililik %)
            </span>
            <span className="font-semibold text-heading">%{relThreshold}</span>
          </div>
          <p className="text-sm text-muted">
            Ürün görseli bu yüzdenin üstünde ilgililik alırsa otomatik kabul
            edilir; altındakiler admin onayına düşer.
          </p>
          <input
            type="range"
            min={0}
            max={100}
            value={relThreshold}
            onChange={(e) => setRelThreshold(Number(e.target.value))}
            className="w-full accent-primary-500"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-heading">
              Uygunsuzluk eşiği (NSFW %)
            </span>
            <span className="font-semibold text-heading">%{nsfwThreshold}</span>
          </div>
          <p className="text-sm text-muted">
            Bir görselin uygunsuzluk skoru bu yüzdeyi aşarsa engellenir (avatar,
            koleksiyon, ürün ve diğer tüm görsel yüklemeleri kapsar).
          </p>
          <input
            type="range"
            min={0}
            max={100}
            value={nsfwThreshold}
            onChange={(e) => setNsfwThreshold(Number(e.target.value))}
            className="w-full accent-primary-500"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={saveThresholds} disabled={savingCfg || !enabled}>
            {savingCfg ? "Kaydediliyor..." : "Eşikleri Kaydet"}
          </Button>
        </div>
      </div>

      {/* Birleşik AI denetim günlüğü (tüm varlıklar) */}
      <ModerationEventsPanel
        showEntityColumn
        title="Denetim Günlüğü"
        description="Tüm varlıklarda AI tarafından engellenen / işaretlenen içerikler"
      />
    </div>
  );
}
