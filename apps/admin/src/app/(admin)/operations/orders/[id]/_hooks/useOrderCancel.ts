"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";

/**
 * "Siparişi iptal et" modalının veri katmanı: iade tutarı önizlemesi (modal
 * açıkken, iptalle AYNI sunucu hesabından) + iptal mutasyonu. Başarıda sipariş
 * listesi ve dosyası (`orders`), iade talepleri ve ödemeler tazelenir.
 *
 * @param onDone Mutasyon bitince (başarı ya da hata) çağrılır — modalı kapatır.
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

  const preview = useQuery({
    queryKey: adminKeys.preview("order-cancel", orderId),
    queryFn: async () => (await adminApi.getOrderCancelPreview(orderId)).data,
    enabled: open && !!orderId,
    // Tutar sepetin o anki durumuna bağlı (kardeş kalem iptal edildiyse kargo
    // bu kaleme geçer): her açılışta taze okunur, eski tutar bir an bile
    // görünmesin diye önbellekte tutulmaz.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const cancel = useAdminMutation(
    (reason: string) => adminApi.cancelOrder(orderId, reason.trim()),
    {
      invalidates: ["orders", "refund-requests", "payments"],
      successMessage: t("admin.operations.orders.cancel.success"),
      errorMessage: t("admin.operations.orders.cancel.failed"),
      onSuccess: onDone,
      mutation: {
        // Hata da siparişin durumunu değiştirmiş olabilir (PSP hatasında talep
        // açılıp incelemeye düşer): dosya tazelenir ki "İade Talepleri'nde
        // bekliyor" uyarısı görünsün ve düğme kalksın; sunucunun mesajı
        // (ör. yarıda kalmış iptal → talebe yönlendirme) toast'ta kalır.
        onSettled: (_data, error) => {
          if (!error) return;
          queryClient.invalidateQueries({ queryKey: adminKeys.all("orders") });
          onDone();
        },
      },
    },
  );

  return { preview, cancel };
}
