import { ShipmentStatus } from '@prisma/client';

/**
 * Takas kabul edilince HER İKİ taraf için de depo (to_warehouse) kargo etiketini oluşturur.
 *
 * Neden: Önceden depo etiketleri yalnızca her kullanıcı `shipToWarehouse`'u çağırınca
 * (per-user) oluşuyordu; karşı tarafın numarası yoktu → "bekleniyor" görünüyordu (BUG B).
 * Artık kabulde (non-cash) veya nakit ödeme tamamlanınca ikisine de numara/etiket verilir,
 * iki taraf da paralel teslim eder.
 *
 * - Idempotent: bir tarafın to_warehouse gönderimi zaten varsa tekrar oluşturmaz.
 * - to_warehouse ayağı Sürat'ı ÇAĞIRMAZ (mevcut davranışla aynı) → saf DB, deploy-güvenli.
 * - `fromAddressId` null bırakılır; kullanıcı kargoya verirken (shipToWarehouse) set edilir.
 *
 * Aynı $transaction (tx) içinde çağrılmalıdır.
 */
export async function createTradeWarehouseShipments(
  tx: any,
  trade: { id: string; tradeNumber: string; initiatorId: string; receiverId: string },
): Promise<void> {
  const existing = await tx.tradeShipment.findMany({
    where: { tradeId: trade.id, leg: 'to_warehouse' },
    select: { shipperId: true },
  });
  const have = new Set<string>(existing.map((s: any) => s.shipperId));

  const parties = [
    { userId: trade.initiatorId, suffix: 'INI' },
    { userId: trade.receiverId, suffix: 'REC' },
  ];

  for (const p of parties) {
    if (have.has(p.userId)) continue;
    // tradeNumber zaten "TRD-..." ile başlar → tekrar TRD- ekleme (çift önek olmasın)
    const trackingNumber = `${trade.tradeNumber}-WM-${p.suffix}`
      .replace(/[^a-zA-Z0-9-]/g, '')
      .slice(0, 50);
    await tx.tradeShipment.create({
      data: {
        tradeId: trade.id,
        shipperId: p.userId,
        fromAddressId: null,
        carrier: 'surat',
        trackingNumber,
        status: ShipmentStatus.label_created,
        shippedAt: null,
        leg: 'to_warehouse',
        recipientType: 'warehouse',
        recipientUserId: null,
      },
    });
  }
}
