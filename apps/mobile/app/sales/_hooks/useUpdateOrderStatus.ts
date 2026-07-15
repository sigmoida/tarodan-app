import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appAlert } from "@tarodan/ui-native";
import { ordersApi, shippingApi } from '@/lib/api';

interface UpdateOrderStatusVars {
  orderId: string;
  status: string;
  trackingNumber?: string;
}

/**
 * Satıcı sipariş durumu mutasyonu. Backend'de tek "status update" endpoint'i yok;
 * iki ayrı akış vardır:
 *   - "processing" → POST /orders/:id/prepare              (markAsPreparing)
 *   - "shipped"    → GET /shipping/order/:id + PATCH /shipping/:id/tracking
 *
 * `onDone` yalnızca UI reset içindir (modal kapatma / input temizleme); snackbar +
 * invalidate bu hook'a aittir (mobile CLAUDE.md §6 — mutation hook owns
 * appAlert + invalidateQueries). §12 notu gereği modal, appAlert'ten ÖNCE
 * kapatılır (iOS'te açık Modal üstünde alert donmaya yol açar).
 */
export function useUpdateOrderStatus(onDone?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      status,
      trackingNumber,
    }: UpdateOrderStatusVars) => {
      if (status === "processing" || status === "preparing") {
        return ordersApi.markAsPreparing(orderId);
      }
      if (status === "shipped") {
        // Fiziksel siparişlerde shipment ödeme anında OTOMATİK oluşur; tekrar
        // POST /shipping "zaten var" (400) döndürür. Mevcut shipment'i çekip takip
        // numarasını işleriz; hiç yoksa (eski/edge sipariş) bir kez oluştururuz.
        let shipment: { id?: string } | undefined;
        try {
          const existing = await shippingApi.getOrderShipments(orderId);
          shipment = (existing.data as any)?.data ?? (existing.data as any);
        } catch {
          const created = await shippingApi.createShipment({
            orderId,
            provider: "surat",
          });
          shipment = (created.data as any)?.data ?? (created.data as any);
        }
        if (trackingNumber && shipment?.id) {
          await shippingApi.updateTracking(shipment.id, { trackingNumber });
        }
        return shipment;
      }
      throw new Error(`Desteklenmeyen sipariş durumu: ${status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      onDone?.();
      appAlert("Başarılı", "Sipariş durumu güncellendi");
    },
    onError: (e: any) => {
      appAlert(
        "Hata",
        e?.response?.data?.message || e?.message || "Durum güncellenemedi",
      );
    },
  });
}
