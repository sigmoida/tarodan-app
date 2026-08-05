import {
  ELOGO_NUMBER_LENGTH,
  formatElogoInvoiceNumber,
  highestSequenceValue,
} from "./elogo-document-number";

/**
 * Belge numarası GİB için 16 karakter ve BOŞLUKSUZ (gap-free) olmak zorunda.
 * Formatı bilen tek yer burasıdır: runtime tahsisi ve seed aynı fonksiyonu
 * kullanır.
 *
 * Seed, `elogo_invoices` satırlarını numaralarıyla birlikte yazıp sayacı
 * ilerletmeyi atlıyordu. Sonraki gerçek tahsis 1'den başlıyor, unique
 * `invoice_number` kısıtına takılıyor ve — artış aynı transaction'da olduğu için —
 * sayaç artışı da geri sarıyordu: hiçbir fatura kesilemeyen kalıcı bir kilit.
 */
describe("eLogo belge numarası", () => {
  it("GİB formatı: 3 harf önek + 4 hane yıl + 9 hane sıra", () => {
    const no = formatElogoInvoiceNumber("TRD", 2026, 1);
    expect(no).toBe("TRD2026000000001");
    expect(no).toHaveLength(ELOGO_NUMBER_LENGTH);
  });

  it("büyük sıra numaraları da 16 karakterde kalır", () => {
    expect(formatElogoInvoiceNumber("TRD", 2026, 123456789)).toBe(
      "TRD2026123456789",
    );
  });

  it("yazılmış numaralardan sayacın olması gereken değeri çözer", () => {
    const numbers = [
      "TRD2026000000001",
      "TRD2026000000004",
      "TRD2026000000002",
    ];
    expect(highestSequenceValue(numbers, "TRD", 2026)).toBe(4);
  });

  it("başka önek ya da yıl sayacı etkilemez", () => {
    const numbers = [
      "TRD2025000000009", // önceki yıl — ayrı sayaç
      "ABC2026000000007", // başka önek
      "TRD2026000000003",
    ];
    expect(highestSequenceValue(numbers, "TRD", 2026)).toBe(3);
  });

  it("hiç numara yoksa sayaç 0'dır", () => {
    expect(highestSequenceValue([], "TRD", 2026)).toBe(0);
    expect(highestSequenceValue(["bozuk", ""], "TRD", 2026)).toBe(0);
  });

  it("üretilen numaralar kendi çözücüsüyle tutarlıdır", () => {
    const produced = [3, 1, 2].map((n) =>
      formatElogoInvoiceNumber("TRD", 2026, n),
    );
    expect(highestSequenceValue(produced, "TRD", 2026)).toBe(3);
  });
});
