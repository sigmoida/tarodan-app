"use client";

import { Spinner } from "@tarodan/ui";
import { refundsApi } from "@/lib/api";
import { useTranslation } from "@/i18n/LanguageContext";
import { useAuthStore } from "@/stores/authStore";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const statusLabel: Record<string, { tr: string; en: string; tone: string }> = {
  pending_review:      { tr: "Satıcı İncelemesinde", en: "Awaiting Seller",      tone: "info"    },
  approved:            { tr: "Onaylandı",             en: "Approved",             tone: "success" },
  wait_for_delivery:   { tr: "Teslim Bekleniyor",     en: "Awaiting Delivery",    tone: "info"    },
  return_shipment_open:{ tr: "Kargo Hazır",           en: "Return Label Ready",   tone: "info"    },
  return_in_transit:   { tr: "İade Yolda",            en: "Return In Transit",    tone: "info"    },
  return_delivered:    { tr: "Satıcıya Ulaştı",       en: "Reached Seller",       tone: "success" },
  refunded:            { tr: "İade Tamamlandı",        en: "Refunded",             tone: "success" },
  rejected:            { tr: "Reddedildi",             en: "Rejected",             tone: "danger"  },
  disputed:            { tr: "İtiraz / İnceleme",      en: "Under Dispute",        tone: "warning" },
  cancelled:           { tr: "İptal Edildi",           en: "Cancelled",            tone: "muted"   },
};

const toneClass: Record<string, string> = {
  info:    "bg-info-50 text-info-700 border-info-200",
  success: "bg-success-50 text-success-700 border-success-200",
  warning: "bg-warning-50 text-warning-700 border-warning-200",
  danger:  "bg-danger-50 text-danger-700 border-danger-200",
  muted:   "bg-surface-alt text-muted border-border-default",
};

export default function MyRefundRequestsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { locale } = useTranslation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login?redirect=/profile/refund-requests");
    }
  }, [authLoading, isAuthenticated, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["refund-requests-buyer"],
    queryFn: async () => {
      const res = await refundsApi.myRequests();
      return res.data as Array<any>;
    },
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-heading mb-6">
          {locale === "en" ? "Refund Requests" : "İade Taleplerim"}
        </h1>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="bg-surface-elevated rounded-xl p-8 text-center text-muted">
            {locale === "en"
              ? "You have no refund requests yet."
              : "Henüz iade talebiniz yok."}
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((rr) => {
              const cfg = statusLabel[rr.status] ?? {
                tr: rr.status,
                en: rr.status,
                tone: "muted",
              };
              return (
                <Link
                  key={rr.id}
                  href={`/profile/refund-requests/${rr.id}`}
                  className="block bg-surface-elevated rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-14 h-14 rounded-lg bg-surface flex items-center justify-center overflow-hidden flex-shrink-0">
                      {rr.order?.product?.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={rr.order.product.images[0]}
                          alt={rr.order?.product?.title ?? ""}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">📦</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted">
                        {locale === "en" ? "Refund" : "İade"} #{rr.refundNumber}
                      </p>
                      <p className="font-medium text-heading mt-1 truncate">
                        {rr.order?.product?.title ?? "—"}
                      </p>
                      <p className="text-sm text-muted mt-1">
                        {locale === "en" ? "Order" : "Sipariş"}{" "}
                        {rr.order?.orderNumber} · ₺
                        {Number(rr.amount).toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${toneClass[cfg.tone]}`}
                    >
                      {locale === "en" ? cfg.en : cfg.tr}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
