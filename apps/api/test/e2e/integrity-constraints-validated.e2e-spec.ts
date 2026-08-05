import { getPrisma, disconnectPrisma } from "../test-utils/db";

/**
 * NOT VALID bırakılmış CHECK kısıtlarının VALIDATE edildiğini sabitler
 * (migration: 20260803120000_validate_integrity_constraints).
 *
 * NOT VALID kısıt yeni/güncellenen satırları zaten zorlar; fark yalnız MEVCUT
 * satırlardadır: convalidated=false iken geçmiş kirli veri sessizce yaşar ve
 * Postgres planner kısıtı sorgu optimizasyonunda kullanamaz. Üretim launch'ı
 * boş/reset DB olduğundan VALIDATE bedavadır; veri taşıyan bir ortamda ise
 * kirli satır varsa migration orada PATLAR — repo'nun kendi migration yorumunun
 * (integrity_constraints_v2, madde C) "istenen davranış" dediği tespit budur.
 *
 * Saf veri katmanı testi: app boot yok, yalnız pg katalog sorgusu.
 */
describe("integrity constraints are VALIDATED (E2E)", () => {
  const prisma = getPrisma();

  afterAll(async () => {
    await disconnectPrisma();
  });

  /** (tablo, kısıt) → pg_constraint.convalidated */
  async function isValidated(constraint: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<
      Array<{ convalidated: boolean }>
    >`SELECT convalidated FROM pg_constraint WHERE conname = ${constraint}`;
    expect(rows).toHaveLength(1); // kısıt yeniden adlandırılırsa test bunu da yakalasın
    return rows[0].convalidated;
  }

  it.each([
    // v2'de <= olarak yeniden eklendi, hiç doğrulanmadı
    "payout_transfers_net_amount_check",
    // pozitiflik kısıtları (drift/oversell'in DB katmanı)
    "products_quantity_nonneg_check",
    "products_reserved_quantity_nonneg_check",
    "orders_quantity_positive_check",
    // v2 madde C'de doğrulanmıştı — regresyona karşı sabitle
    "payments_exactly_one_source_check",
  ])("%s doğrulanmış (convalidated) olmalı", async (constraint) => {
    expect(await isValidated(constraint)).toBe(true);
  });
});
