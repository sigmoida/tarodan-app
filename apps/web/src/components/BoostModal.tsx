"use client";

import { useEffect, useState } from "react";
import { RocketLaunchIcon, XMarkIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Spinner } from "@tarodan/ui";
import { api } from "@/lib/api";

interface BoostOption {
  durationDays: number;
  price: number;
  label: string;
}

interface BoostModalProps {
  listingId: string;
  listingTitle: string;
  /** İlanın mevcut boost bitiş tarihi (varsa) — kalan süre üstüne ekleme bilgisi için */
  boostedUntil?: string | null;
  /** Kullanıcı premium mi — "otomatik yenile" seçeneği premium'a özel */
  isPremium?: boolean;
  open: boolean;
  onClose: () => void;
}

/**
 * İlanı öne çıkar (boost) modalı: süre/fiyat seçimi → ödeme başlat → paymentUrl'e yönlendir.
 * Backend: GET /products/boost/pricing, POST /products/:id/boost/initiate
 */
export default function BoostModal({
  listingId,
  listingTitle,
  boostedUntil,
  isPremium = false,
  open,
  onClose,
}: BoostModalProps) {
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [options, setOptions] = useState<BoostOption[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingPricing(true);
    api
      .get("/products/boost/pricing")
      .then((res) => {
        const data = res.data || {};
        const opts: BoostOption[] = data.options || [];
        setOptions(opts);
        setEnabled(data.enabled !== false);
        // Varsayılan seçim: 7 gün varsa o, yoksa ilk seçenek
        const seven = opts.find((o) => o.durationDays === 7);
        setSelected(seven?.durationDays ?? opts[0]?.durationDays ?? null);
      })
      .catch(() => {
        toast.error("Fiyatlar yüklenemedi");
      })
      .finally(() => setLoadingPricing(false));
  }, [open]);

  if (!open) return null;

  const remainingDays = boostedUntil
    ? Math.max(0, Math.ceil((new Date(boostedUntil).getTime() - Date.now()) / 86400000))
    : 0;
  const hasActiveBoost = remainingDays > 0;

  const handleConfirm = async () => {
    if (selected == null) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/products/${listingId}/boost/initiate`, {
        durationDays: selected,
        autoRenew: isPremium ? autoRenew : false,
      });
      const paymentUrl = res.data?.paymentUrl;
      if (paymentUrl && String(paymentUrl).startsWith("http")) {
        window.location.href = paymentUrl;
        return;
      }
      toast.error("Ödeme başlatılamadı");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Öne çıkarma başlatılamadı",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface-elevated rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <RocketLaunchIcon className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-heading">İlanı Öne Çıkar</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-heading"
            aria-label="Kapat"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted mb-4 line-clamp-2">
            <span className="font-medium text-heading">{listingTitle}</span>{" "}
            ilanını seçtiğiniz süre boyunca arama, kategori ve ana sayfa
            vitrininde üst sıralarda gösterin.
          </p>

          {hasActiveBoost && (
            <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-sm text-amber-800">
              Bu ilanda aktif öne çıkarma var:{" "}
              <span className="font-semibold">~{remainingDays} gün</span> kaldı.
              Seçtiğiniz süre kalan sürenin üstüne eklenir.
              {selected != null && (
                <div className="mt-1 font-semibold">
                  Kalan {remainingDays} günün üstüne {selected} gün eklenecektir →
                  toplam ~{remainingDays + selected} gün
                </div>
              )}
            </div>
          )}

          {loadingPricing ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : !enabled ? (
            <div className="text-center py-6 text-muted">
              Öne çıkarma şu anda kullanılamıyor.
            </div>
          ) : options.length === 0 ? (
            <div className="text-center py-6 text-muted">
              Uygun bir öne çıkarma paketi bulunamadı.
            </div>
          ) : (
            <div className="space-y-2">
              {options.map((opt) => (
                <label
                  key={opt.durationDays}
                  className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
                    selected === opt.durationDays
                      ? "border-amber-500 bg-amber-50"
                      : "border-border hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="boost-duration"
                      checked={selected === opt.durationDays}
                      onChange={() => setSelected(opt.durationDays)}
                      className="accent-amber-500"
                    />
                    <span className="font-medium text-heading">{opt.label}</span>
                  </div>
                  <span className="font-bold text-primary-600">
                    {opt.price.toLocaleString("tr-TR", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}{" "}
                    ₺
                  </span>
                </label>
              ))}
            </div>
          )}

          {isPremium && enabled && options.length > 0 && (
            <label className="mt-4 flex items-center gap-2 text-sm text-body cursor-pointer">
              <input
                type="checkbox"
                checked={autoRenew}
                onChange={(e) => setAutoRenew(e.target.checked)}
                className="accent-amber-500"
              />
              Süre bitince otomatik yenileme hatırlatması al (Premium)
            </label>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onClose}
            disabled={submitting}
          >
            Vazgeç
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={
              submitting || loadingPricing || !enabled || selected == null
            }
          >
            {submitting
              ? "Yönlendiriliyor..."
              : hasActiveBoost
                ? "Süreyi Uzat ve Öde"
                : "Öne Çıkar ve Öde"}
          </Button>
        </div>
      </div>
    </div>
  );
}
