"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { AdminCancelRequest } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { extractErrorI18nKey } from "@/lib/error";
import { useAdminMutation } from "@/hooks/useAdminMutation";

/** Önizlemeden sonra siparişin türü değişti (ör. arada ödendi). */
const KIND_CHANGED_KEY = "server.admin.order.cancelKindChanged";

/**
 * "Siparişi iptal et" diyaloğunun veri katmanı: iptal önizlemesi (modal
 * açıkken, iptalle AYNI sunucu hesabından — tür + iade tutarı ya da "ödeme
 * yok" + stok) ve iptal mutasyonu. Onay, önizlemenin türünü `expectedKind`
 * olarak gönderir; sunucu kilit altında tür değiştiğini görürse 409 döner ve
 * diyalog kapanmadan önizleme tazelenir (para yok → iade sessizce geçmez).
 * Başarıda sipariş listesi ve dosyası, teklifler, iptal/iade listeleri ve
 * ödemeler tazelenir.
 *
 * @param onDone Mutasyon bitince (başarı ya da tür-değişimi dışındaki hata)
 *   çağrılır — modalı kapatır.
 */
export function useOrderCancel({
  orderId,
  open,
  onDone,
}: {
  orderId: string;
  open: boolean;
  onDone: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [kindChanged, setKindChanged] = useState(false);
  // Uyarı yalnız aynı diyalog oturumuna aittir: kapanınca ya da başka bir
  // sipariş için açılınca temizlenir (modal dosyada ve tabloda mount'lu
  // kalır; bayat uyarı başka siparişin diyaloğunda görünüyordu).
  useEffect(() => {
    setKindChanged(false);
  }, [open, orderId]);

  const preview = useQuery({
    queryKey: adminKeys.preview("order-cancel", orderId),
    queryFn: async () => (await adminApi.getOrderCancelPreview(orderId)).data,
    enabled: open && !!orderId,
    // Tutar sepetin o anki durumuna bağlı (kardeş kalem iptal edildiyse kargo
    // bu kaleme geçer) ve tür ödeme callback'iyle değişebilir: her açılışta
    // taze okunur, eski önizleme bir an bile görünmesin diye önbellekte
    // tutulmaz.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const kind = preview.data?.kind;
  const cancel = useAdminMutation(
    (request: AdminCancelRequest) => {
      if (!kind) throw new Error("cancel preview missing");
      return adminApi.cancelOrder(orderId, { ...request, expectedKind: kind });
    },
    {
      invalidates: [
        "orders",
        "offers",
        "cancellations",
        "refund-requests",
        "payments",
      ],
      successMessage:
        kind === "unpaid"
          ? t("admin.operations.orders.cancel.successUnpaid")
          : t("admin.operations.orders.cancel.success"),
      errorMessage: t("admin.operations.orders.cancel.failed"),
      onSuccess: onDone,
      mutation: {
        onMutate: () => setKindChanged(false),
        onSettled: (_data, error) => {
          if (!error) return;
          if (extractErrorI18nKey(error) === KIND_CHANGED_KEY) {
            // Diyalog açık kalır; admin güncel türü görüp yeniden onaylar.
            setKindChanged(true);
            void preview.refetch();
            return;
          }
          // Hata da siparişin durumunu değiştirmiş olabilir (PSP hatasında
          // talep açılıp incelemeye düşer): dosya tazelenir ki "İade
          // Talepleri'nde bekliyor" uyarısı görünsün ve düğme kalksın;
          // sunucunun mesajı toast'ta kalır.
          queryClient.invalidateQueries({ queryKey: adminKeys.all("orders") });
          onDone();
        },
      },
    },
  );

  return { preview, cancel, kindChanged };
}
