import {
  INVOICE_TIME_ZONE,
  invoiceIssueDate,
  invoiceIssueTime,
  invoiceIssueYear,
} from "./invoice-datetime";

/**
 * Faturanın tarihi, saati ve numara yılı AYNI takvimden okunmalıdır: Türkiye.
 *
 * Eskiden tarih `toISOString()` (UTC) ile, saat `toTimeString()` (süreç yerel
 * saati) ile üretiliyordu. Sunucu UTC'de koştuğu için belgeler Türkiye saatinden
 * 3 saat geri düşüyor; gece yarısından sonra kesilen fatura bir ÖNCEKİ güne,
 * 31 Aralık gecesi kesilen fatura bir önceki YILA yazılıyordu. Süreç
 * `TZ=Europe/Istanbul` ile başlatılsaydı bu kez tarih ile saat birbiriyle
 * çelişecekti (dünün tarihi + bugünün saati).
 */
describe("fatura tarih/saat takvimi", () => {
  it("Türkiye takvimini kullanır", () => {
    expect(INVOICE_TIME_ZONE).toBe("Europe/Istanbul");
  });

  it("gece yarısından sonra kesilen fatura Türkiye gününe yazılır", () => {
    // 4 Ağustos 22:30 UTC = 5 Ağustos 01:30 İstanbul.
    const at = new Date("2026-08-04T22:30:00.000Z");
    expect(invoiceIssueDate(at)).toBe("2026-08-05");
    expect(invoiceIssueTime(at)).toBe("01:30:00");
    expect(invoiceIssueYear(at)).toBe(2026);
  });

  it("yıl sınırında numara yılı ile belge tarihi ayrışmaz", () => {
    // 31 Aralık 21:30 UTC = 1 Ocak 00:30 İstanbul.
    const at = new Date("2026-12-31T21:30:00.000Z");
    expect(invoiceIssueDate(at)).toBe("2027-01-01");
    expect(invoiceIssueYear(at)).toBe(2027);
    expect(invoiceIssueDate(at).slice(0, 4)).toBe(String(invoiceIssueYear(at)));
  });

  it("gün içinde tarih ve saat birlikte ilerler", () => {
    const at = new Date("2026-08-05T09:05:07.000Z"); // 12:05:07 İstanbul
    expect(invoiceIssueDate(at)).toBe("2026-08-05");
    expect(invoiceIssueTime(at)).toBe("12:05:07");
  });

  it("süreç saat dilimi ne olursa olsun aynı sonucu verir", () => {
    const at = new Date("2026-08-04T22:30:00.000Z");
    const previous = process.env.TZ;
    try {
      for (const tz of ["UTC", "Europe/Istanbul", "America/New_York"]) {
        process.env.TZ = tz;
        expect(invoiceIssueDate(at)).toBe("2026-08-05");
        expect(invoiceIssueTime(at)).toBe("01:30:00");
        expect(invoiceIssueYear(at)).toBe(2026);
      }
    } finally {
      process.env.TZ = previous;
    }
  });

  it("UBL alanları sabit genişliktedir (yyyy-mm-dd / HH:mm:ss)", () => {
    const at = new Date("2026-01-02T00:00:00.000Z"); // 03:00 İstanbul
    expect(invoiceIssueDate(at)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(invoiceIssueTime(at)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
