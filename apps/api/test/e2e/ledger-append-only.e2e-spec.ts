import { Prisma } from "@prisma/client";
import { getPrisma, disconnectPrisma } from "../test-utils/db";

/**
 * Defterin DB seviyesindeki sert garantileri (migration:
 * 20260803070000_ledger_idempotency_append_only).
 *
 * Saf veri katmanı testi: NestJS app boot etmiyor, yalnız Prisma + raw SQL.
 *
 *  1) APPEND-ONLY — `ledger_entries` üzerinde UPDATE/DELETE tetikleyici ile
 *     reddedilir. Değişmezlik bugüne dek yalnız kod disipliniydi (servis update/
 *     delete sunmuyor); elle SQL veya ileride eklenecek bir servis satırları
 *     sessizce değiştirebilirdi. Muhasebede düzeltme TERS KAYITLA yapılır.
 *
 *  2) İDEMPOTENCY — (idempotency_key, line_no) UNIQUE. Uygulamadaki "önce oku
 *     sonra yaz" kontrolü yarışa açıktır (iki eşzamanlı finalize ikisi de boş
 *     okur); asıl koruma budur. NULL anahtarlı eski kayıtlar etkilenmez.
 */
describe("ledger_entries DB guarantees (E2E)", () => {
  const prisma = getPrisma();

  afterAll(async () => {
    await disconnectPrisma();
  });

  /** Tekil bir defter satırı yazar (grup dengesi bu testin konusu değil). */
  async function insertEntry(overrides: Record<string, unknown> = {}) {
    return prisma.ledgerEntry.create({
      data: {
        entryGroupId: `grp-${Math.random().toString(36).slice(2)}`,
        eventType: "adjustment",
        account: "platform_commission",
        direction: "debit",
        amount: new Prisma.Decimal(10),
        ...overrides,
      },
    });
  }

  it("UPDATE'i reddeder (düzeltme ters kayıtla yapılır)", async () => {
    const entry = await insertEntry();

    await expect(
      prisma.ledgerEntry.update({
        where: { id: entry.id },
        data: { amount: new Prisma.Decimal(999) },
      }),
    ).rejects.toThrow(/append-only/i);

    const fresh = await prisma.ledgerEntry.findUnique({
      where: { id: entry.id },
    });
    expect(Number(fresh!.amount)).toBe(10);
  });

  it("DELETE'i reddeder (denetim izi silinemez)", async () => {
    const entry = await insertEntry();

    await expect(
      prisma.ledgerEntry.delete({ where: { id: entry.id } }),
    ).rejects.toThrow(/append-only/i);

    expect(
      await prisma.ledgerEntry.findUnique({ where: { id: entry.id } }),
    ).not.toBeNull();
  });

  it("toplu UPDATE'i de reddeder (satır bazlı tetikleyici)", async () => {
    const entry = await insertEntry();

    await expect(
      prisma.ledgerEntry.updateMany({
        where: { id: entry.id },
        data: { memo: "elle düzeltme" },
      }),
    ).rejects.toThrow(/append-only/i);
  });

  it("aynı (idempotency_key, line_no) ikinci kez yazılamaz", async () => {
    const key = `capture:order:${Math.random().toString(36).slice(2)}`;
    await insertEntry({ idempotencyKey: key, lineNo: 0 });

    await expect(
      insertEntry({ idempotencyKey: key, lineNo: 0 }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("aynı anahtarın farklı satır numaraları serbesttir (grup satırları)", async () => {
    const key = `capture:order:${Math.random().toString(36).slice(2)}`;

    await insertEntry({ idempotencyKey: key, lineNo: 0 });
    await insertEntry({ idempotencyKey: key, lineNo: 1 });

    expect(
      await prisma.ledgerEntry.count({ where: { idempotencyKey: key } }),
    ).toBe(2);
  });

  it("anahtarsız (NULL) kayıtlar sınırsız yazılabilir", async () => {
    const before = await prisma.ledgerEntry.count({
      where: { idempotencyKey: null },
    });

    await insertEntry();
    await insertEntry();

    expect(
      await prisma.ledgerEntry.count({ where: { idempotencyKey: null } }),
    ).toBe(before + 2);
  });
});
