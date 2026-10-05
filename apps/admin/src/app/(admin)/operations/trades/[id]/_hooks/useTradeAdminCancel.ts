"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import type {
  AdminCancelRequest,
  AdminTradeCancelResult,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { CANCELLATIONS_RESOURCE } from "../../../cancellations-refunds/_lib/resource";

/**
 * "Takası iptal et" modalının veri katmanı: önizleme (modal açıkken, iptalle
 * AYNI sunucu kuralı ve iade fonksiyonundan) + iptal mutasyonu. Başarıda takas
 * listesi/dosyası ve İptaller listesi tazelenir.
 *
 * Sonuç mesajı iptalin sonucuna göre seçilir: iade sağlayıcıda patladıysa
 * takas yine iptal edilmiştir ama admin'e "İadeyi yeniden dene" yolunu
 * söyleyen uyarı gösterilir (panel `refundFailureReason` ile görünür olur).
 *
 * @param onDone Mutasyon başarıyla bitince çağrılır — modalı kapatır.
 */
export function useTradeAdminCancel({
  tradeId,
  open,
  onDone,
}: {
  tradeId: string;
  open: boolean;
  onDone: () => void;
}) {
  const t = useTranslations();

  const preview = useQuery({
    queryKey: adminKeys.preview("trade-cancel", tradeId),
    queryFn: async () => (await adminApi.getTradeCancelPreview(tradeId)).data,
    enabled: open && !!tradeId,
    // Ödeme / kargo durumu her an değişebilir: her açılışta taze okunur.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const cancel = useAdminMutation(
    async (body: AdminCancelRequest) =>
      (await adminApi.cancelTrade(tradeId, body)).data,
    {
      invalidates: ["trades", CANCELLATIONS_RESOURCE],
      errorMessage: t("admin.operations.trades.adminCancel.failed"),
      onSuccess: (result: AdminTradeCancelResult) => {
        if (result.refundFailed) {
          toast.error(
            t("admin.operations.trades.adminCancel.successRefundFailed"),
          );
        } else if (result.alreadyCancelled) {
          toast.success(
            t("admin.operations.trades.adminCancel.alreadyCancelled"),
          );
        } else {
          toast.success(t("admin.operations.trades.adminCancel.success"));
        }
        onDone();
      },
    },
  );

  return { preview, cancel };
}
