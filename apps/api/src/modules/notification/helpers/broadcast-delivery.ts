/**
 * Yönetici yayınının teslim izleme satırları (`notification_logs`, kanal
 * `push` / `email`) — durum artık worker SONUCUNDAN yazılır.
 *
 * Eskiden admin servisi kuyruğa yazdıktan hemen sonra tüm `pending` satırları
 * "sent" yapıyordu: push hiç gitmese (token yok, Expo hatası, tercih kapalı)
 * geçmiş ekranı "gönderildi" gösteriyordu. Her yayın bir `broadcastId` taşır;
 * satırlar `data.broadcastId` ile eşlenir ve yalnız `pending` olanlar güncellenir
 * (yeniden deneme bir sonucu ezmez).
 */
import type { PrismaService } from "../../../prisma";

export type BroadcastLogChannel = "push" | "email";

export async function markBroadcastLogRows(
  prisma: Pick<PrismaService, "notificationLog">,
  params: {
    broadcastId: string;
    userIds: string[];
    channels: BroadcastLogChannel[];
    delivered: boolean;
    /** Başarısızlık nedeni (teşhis için, kullanıcıya gösterilmez). */
    error?: string;
  },
): Promise<number> {
  if (params.userIds.length === 0 || params.channels.length === 0) return 0;
  const { count } = await prisma.notificationLog.updateMany({
    where: {
      userId: { in: params.userIds },
      channel: { in: params.channels },
      status: "pending",
      data: { path: ["broadcastId"], equals: params.broadcastId },
    },
    data: params.delivered
      ? { status: "sent", sentAt: new Date(), errorMessage: null }
      : {
          status: "failed",
          errorMessage: (params.error ?? "Delivery failed").slice(0, 500),
        },
  });
  return count;
}
