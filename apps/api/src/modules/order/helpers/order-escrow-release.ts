/**
 * Satıcı ödemesinin (escrow hold) planlanan serbest bırakma tarihi — sipariş
 * yanıtındaki `escrowReleaseAt`.
 *
 * Tarih teslimde hold'a yazılır (`releaseAt` = `returnWindowEndsAt` + payout
 * grace). İstemciler (web, mobil) satıcı ödeme tarihini kendileri hesaplamak
 * yerine bunu gösterir: admin Süreler ve Kurallar'ı sonradan değiştirse de bu
 * siparişin gerçek tarihi değişmez.
 *
 * Yalnız BEKLEYEN (`held`) hold sayılır: serbest bırakılmış ya da iptal edilmiş
 * bir hold için "ödeme şu tarihte yapılacak" demek yanlış olurdu. Hold yoksa ya
 * da henüz tarih yazılmamışsa (teslim edilmedi) null döner.
 */
export interface OrderEscrowHoldLike {
  status: string;
  releaseAt: Date | null;
}

export function escrowReleaseAtOf(
  holds: readonly OrderEscrowHoldLike[] | null | undefined,
): Date | null {
  let latest: Date | null = null;
  for (const hold of holds ?? []) {
    if (hold.status !== "held" || !hold.releaseAt) continue;
    if (!latest || hold.releaseAt > latest) latest = hold.releaseAt;
  }
  return latest;
}
