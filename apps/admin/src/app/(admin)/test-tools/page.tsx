"use client";

import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/api";
import toast from "react-hot-toast";
import { Button, Input, Spinner } from "@tarodan/ui";
import { BeakerIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface CronDef {
  key: string;
  label: string;
  description: string;
}
interface SearchItem {
  id: string;
  label: string;
  status?: string;
  dates: Record<string, string | null>;
}
type AdjustAction = "expire_now" | "set_minutes" | "backdate_days";

const TYPES: { value: string; label: string; placeholder: string }[] = [
  { value: "boost", label: "Öne Çıkarma", placeholder: "ürün başlığı veya slug" },
  { value: "membership", label: "Üyelik", placeholder: "kullanıcı e-posta veya ad" },
  { value: "refund", label: "İade", placeholder: "sipariş no veya iade id" },
  { value: "order", label: "Sipariş", placeholder: "sipariş no" },
  { value: "offer", label: "Teklif", placeholder: "teklif id veya ürün başlığı" },
  { value: "trade", label: "Takas", placeholder: "takas id" },
  { value: "hold", label: "Escrow Hold", placeholder: "sipariş no" },
  { value: "email_verification", label: "E-posta Doğrulama", placeholder: "kullanıcı e-posta" },
  { value: "password_reset", label: "Şifre Sıfırlama", placeholder: "kullanıcı e-posta" },
];

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  const rel = mins === 0 ? "şimdi" : mins > 0 ? `~${mins} dk sonra` : `~${-mins} dk önce`;
  return `${d.toLocaleString("tr-TR")} (${rel})`;
}

export default function TestToolsPage() {
  const [env, setEnv] = useState<{ env: string; isProd: boolean } | null>(null);
  const [crons, setCrons] = useState<CronDef[]>([]);
  const [runningCron, setRunningCron] = useState<string | null>(null);

  const [type, setType] = useState<string>("boost");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [minutes, setMinutes] = useState(1);
  const [days, setDays] = useState(1);

  const [pending, setPending] = useState<{
    item: SearchItem;
    action: AdjustAction;
    value: number;
    field: string;
    afterPreview: string;
  } | null>(null);
  const [applying, setApplying] = useState(false);

  const placeholder = useMemo(() => TYPES.find((t) => t.value === type)?.placeholder ?? "", [type]);

  useEffect(() => {
    adminApi.get("/admin/test-tools/environment").then((r) => setEnv(r.data)).catch(() => {});
    adminApi.get("/admin/test-tools/crons").then((r) => setCrons(r.data)).catch(() => {});
  }, []);

  const runCron = async (key: string) => {
    setRunningCron(key);
    try {
      const r = await adminApi.post("/admin/test-tools/run-cron", { key });
      toast.success(`Çalıştı: ${JSON.stringify(r.data.result)}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Cron çalıştırılamadı");
    } finally {
      setRunningCron(null);
    }
  };

  const doSearch = async () => {
    if (q.trim().length < 2) {
      toast.error("En az 2 karakter girin");
      return;
    }
    setSearching(true);
    setResults([]);
    try {
      const r = await adminApi.get(`/admin/test-tools/search`, { params: { type, q } });
      setResults(r.data);
      if (!r.data.length) toast("Sonuç yok", { icon: "🔍" });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Arama başarısız");
    } finally {
      setSearching(false);
    }
  };

  const previewAfter = (action: AdjustAction, value: number): string => {
    const now = Date.now();
    if (action === "expire_now") return new Date(now).toISOString();
    if (action === "set_minutes") return new Date(now + value * 60000).toISOString();
    return new Date(now - value * 86400000).toISOString();
  };

  const askConfirm = (item: SearchItem, action: AdjustAction, value: number) => {
    const field = Object.keys(item.dates)[0] ?? "tarih";
    setPending({ item, action, value, field, afterPreview: previewAfter(action, value) });
  };

  const applyAdjust = async () => {
    if (!pending) return;
    setApplying(true);
    try {
      const r = await adminApi.post("/admin/test-tools/adjust", {
        type,
        id: pending.item.id,
        action: pending.action,
        value: pending.value,
      });
      toast.success(`${r.data.field}: ${fmt(r.data.after)}`);
      setPending(null);
      await doSearch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Değişiklik başarısız");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BeakerIcon className="w-7 h-7 text-primary-600" />
        <h1 className="text-2xl font-bold">Test Araçları — Zaman Makinesi</h1>
        {env && (
          <span
            className={`px-3 py-1 rounded-full text-sm font-semibold ${
              env.isProd ? "bg-red-600 text-white" : "bg-gray-200 text-gray-700"
            }`}
          >
            {env.isProd ? "⚠ PROD" : env.env}
          </span>
        )}
      </div>

      {env?.isProd && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-red-800">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm">
            PROD ortamındasın. Süre değişiklikleri <b>gerçek müşteri verisini</b> etkiler. Her işlem
            audit log'a yazılır. Dikkatli ol.
          </p>
        </div>
      )}

      {/* Cron'lar */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold mb-1">Cron'lar</h2>
        <p className="text-sm text-gray-500 mb-4">
          Zamanlanmış işleri manuel tetikle (zararsız: yalnız zaten olacak işi erken yapar).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {crons.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg p-3">
              <div>
                <p className="font-medium">{c.label}</p>
                <p className="text-xs text-gray-500">{c.description}</p>
              </div>
              <Button onClick={() => runCron(c.key)} disabled={runningCron === c.key} variant="secondary">
                {runningCron === c.key ? <Spinner size="sm" /> : "Çalıştır"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Süre Ayarlama */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold mb-1">Süre Ayarlama</h2>
        <p className="text-sm text-gray-500 mb-4">
          Tek bir kaydı ara, ilgili tarih alanını geri/ileri al. Sonra ilgili cron'u tetikleyip
          davranışı doğrula.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tip</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setResults([]);
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-gray-500 mb-1">Ara ({placeholder})</label>
            <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder={placeholder} onKeyDown={(e: any) => e.key === "Enter" && doSearch()} />
          </div>
          <Button onClick={doSearch} disabled={searching}>
            {searching ? <Spinner size="sm" /> : "Ara"}
          </Button>
        </div>

        {/* Aksiyon parametreleri */}
        <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">X dk sonra:</span>
            <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-20 border border-gray-300 rounded px-2 py-1" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">N gün geri:</span>
            <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-20 border border-gray-300 rounded px-2 py-1" />
          </div>
        </div>

        {results.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">Kayıt</th>
                  <th className="py-2 pr-3">Durum</th>
                  <th className="py-2 pr-3">Tarihler</th>
                  <th className="py-2 pr-3">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-gray-400">{item.id}</div>
                    </td>
                    <td className="py-2 pr-3">{item.status ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {Object.entries(item.dates).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-gray-500">{k}:</span> {fmt(v)}
                        </div>
                      ))}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => askConfirm(item, "expire_now", 0)}>
                          Şimdi bitir
                        </Button>
                        <Button variant="secondary" onClick={() => askConfirm(item, "set_minutes", minutes)}>
                          {minutes} dk sonra
                        </Button>
                        <Button variant="secondary" onClick={() => askConfirm(item, "backdate_days", days)}>
                          {days} gün geri
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Onay modalı */}
      {pending && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-3">Onayla</h3>
            <p className="text-sm text-gray-600 mb-4">
              <b>{pending.item.label}</b> kaydının <code>{pending.field}</code> alanı değişecek:
            </p>
            <div className="bg-gray-50 rounded-lg p-3 text-sm mb-4 space-y-1">
              <div>
                <span className="text-gray-500">Eski:</span> {fmt(pending.item.dates[pending.field] ?? null)}
              </div>
              <div>
                <span className="text-gray-500">Yeni:</span> <b>{fmt(pending.afterPreview)}</b>
              </div>
            </div>
            {env?.isProd && (
              <p className="text-xs text-red-700 mb-3">⚠ PROD — gerçek veri değişecek.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)} disabled={applying}>
                Vazgeç
              </Button>
              <Button onClick={applyAdjust} disabled={applying}>
                {applying ? <Spinner size="sm" /> : "Uygula"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
