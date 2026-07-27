"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { ClockIcon } from "@heroicons/react/24/outline";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Modal,
  Radio,
  Spinner,
} from "@tarodan/ui";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

interface BoostDurationOption {
  durationDays: number;
  price: number;
  listPrice: number;
  campaign: boolean;
  label: string;
}

interface BoostPackage {
  id: string;
  name: string;
  slug: string;
  showcaseOnHome: boolean;
  options: BoostDurationOption[];
}

interface BoostOptionsResponse {
  enabled?: boolean;
  productPrice?: number;
  packages?: BoostPackage[];
}

interface Selection {
  packageId: string;
  durationDays: number;
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

const fmtPrice = (v: number) =>
  `${v.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₺`;

/**
 * İlanı öne çıkar (boost) modalı: ürünün fiyatına göre değişen paketlerden
 * (Ekonomik / Vitrin) paket + süre seç → ödeme başlat → /payment ekranına git.
 * Backend: GET /products/:id/boost/options, POST /products/:id/boost/initiate
 */
export default function BoostModal({
  listingId,
  listingTitle,
  boostedUntil,
  isPremium = false,
  open,
  onClose,
}: BoostModalProps) {
  const t = useTranslations();
  const router = useRouter();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);

  // Per-product package/price matrix — fetched only while open, cached per product.
  const optionsQuery = useQuery({
    queryKey: queryKeys.boost.options(listingId),
    queryFn: async (): Promise<BoostOptionsResponse> => {
      const res = await api.get(`/products/${listingId}/boost/options`);
      return res.data || {};
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
    meta: { page: "boost-options" },
  });

  const packages: BoostPackage[] = useMemo(
    () => optionsQuery.data?.packages ?? [],
    [optionsQuery.data],
  );
  const enabled = optionsQuery.data
    ? optionsQuery.data.enabled !== false
    : true;
  const loadingOptions = open && optionsQuery.isLoading;

  useEffect(() => {
    if (optionsQuery.isError) toast.error(t("profile.boost.pricingLoadError"));
  }, [optionsQuery.isError, t]);

  // Default selection once options arrive: first package's 7-day tier if present,
  // else its first tier — without overriding a choice the user already made.
  useEffect(() => {
    if (!packages.length) return;
    setSelected((cur) => {
      if (cur) return cur;
      const pkg = packages[0];
      const opt =
        pkg.options.find((o) => o.durationDays === 7) ?? pkg.options[0];
      return opt ? { packageId: pkg.id, durationDays: opt.durationDays } : null;
    });
  }, [packages]);

  const boost = useMutation({
    mutationFn: (sel: Selection) =>
      api.post(`/products/${listingId}/boost/initiate`, {
        packageId: sel.packageId,
        durationDays: sel.durationDays,
        autoRenew: isPremium ? autoRenew : false,
      }),
    // Üyelik/sipariş akışıyla parite: tüm tarayıcıyı PayTR'a atmak yerine uygulama-içi
    // ödeme ekranına (/payment/[id]) git — PayTR kart formu iframe içinde gösterilir,
    // bypass modunda da aynı ekran otomatik tamamlar.
    onSuccess: (res) => {
      const paymentId = res.data?.paymentId;
      if (paymentId) {
        onClose();
        router.push(`/payment/${paymentId}?type=boost`);
      } else {
        toast.error(t("profile.boost.paymentStartFailed"));
      }
    },
    onError: (error: any) =>
      toast.error(
        error?.response?.data?.message || t("profile.boost.initiateFailed"),
      ),
  });

  const remainingDays = boostedUntil
    ? Math.max(
        0,
        Math.ceil((new Date(boostedUntil).getTime() - Date.now()) / 86400000),
      )
    : 0;
  const hasActiveBoost = remainingDays > 0;

  const isSelected = (packageId: string, durationDays: number) =>
    selected?.packageId === packageId &&
    selected?.durationDays === durationDays;

  const handleConfirm = () => {
    if (selected) boost.mutate(selected);
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("profile.boost.title")}
      maxWidth="max-w-lg"
    >
      <p className="text-sm text-muted mb-1 font-medium text-heading line-clamp-2">
        {listingTitle}
      </p>
      <p className="text-sm text-muted mb-4">{t("profile.boost.intro")}</p>

      {hasActiveBoost && (
        <Alert
          variant="warning"
          icon={<ClockIcon className="h-5 w-5 text-warning-600" />}
          title="Aktif Öne Çıkarma"
          className="mb-4"
        >
          {t("profile.boost.activeBoostInfo", { days: remainingDays })}
          {selected != null && (
            <div className="mt-1 font-semibold">
              {t("profile.boost.extendSummary", {
                remaining: remainingDays,
                selected: selected.durationDays,
                total: remainingDays + selected.durationDays,
              })}
            </div>
          )}
        </Alert>
      )}

      {loadingOptions ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : !enabled ? (
        <div className="text-center py-6 text-muted">
          {t("profile.boost.unavailable")}
        </div>
      ) : packages.length === 0 ? (
        <div className="text-center py-6 text-muted">
          {t("profile.boost.noPackages")}
        </div>
      ) : (
        <div className="space-y-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-lg border border-border overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 bg-surface-alt/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-heading">{pkg.name}</span>
                  {pkg.showcaseOnHome && (
                    <Badge variant="primary" size="sm">
                      {t("profile.boost.showcaseBadge")}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted">
                  {pkg.showcaseOnHome
                    ? t("profile.boost.showcaseHint")
                    : t("profile.boost.searchHint")}
                </span>
              </div>

              <div className="divide-y divide-border">
                {pkg.options.map((opt) => {
                  const active = isSelected(pkg.id, opt.durationDays);
                  return (
                    <label
                      key={opt.durationDays}
                      className={`flex items-center justify-between px-3 py-3 cursor-pointer transition-colors ${
                        active ? "bg-warning-50" : "hover:bg-surface-alt/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Radio
                          name={`boost-${pkg.id}`}
                          checked={active}
                          onChange={() =>
                            setSelected({
                              packageId: pkg.id,
                              durationDays: opt.durationDays,
                            })
                          }
                        />
                        <span className="font-medium text-heading">
                          {t("profile.boost.daysValue", {
                            days: opt.durationDays,
                          })}
                        </span>
                        {opt.campaign && (
                          <Badge variant="danger" size="sm">
                            {t("profile.boost.campaign")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2">
                        {opt.campaign && (
                          <span className="text-xs text-subtle line-through">
                            {fmtPrice(opt.listPrice)}
                          </span>
                        )}
                        <span className="font-bold text-primary-600">
                          {fmtPrice(opt.price)}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {isPremium && enabled && packages.length > 0 && (
        <label className="mt-4 flex items-center gap-2 text-sm text-body cursor-pointer">
          <Checkbox
            checked={autoRenew}
            onChange={(e) => setAutoRenew(e.target.checked)}
          />
          {t("profile.boost.autoRenewLabel")}
        </label>
      )}

      <div className="mt-5 flex gap-2 pt-4 border-t border-border">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          disabled={boost.isPending}
        >
          {t("common.cancel")}
        </Button>
        <Button
          className="flex-1"
          onClick={handleConfirm}
          disabled={
            boost.isPending || loadingOptions || !enabled || selected == null
          }
        >
          {boost.isPending
            ? t("profile.boost.redirecting")
            : hasActiveBoost
              ? t("profile.boost.extendAndPay")
              : t("profile.boost.featureAndPay")}
        </Button>
      </div>
    </Modal>
  );
}
