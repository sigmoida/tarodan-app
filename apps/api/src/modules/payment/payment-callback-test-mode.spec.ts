import { isRejectableTestModeSuccess } from "./paytr-test-mode.guard";

/**
 * HIGH: PayTR bildirim hash'i `merchant_oid + salt + status + total_amount`
 * üzerinden hesaplanır — `test_mode` KAPSAM DIŞIDIR. Kod `test_mode`'u yalnız
 * gözlemlenebilirlik için kaydediyor, hiçbir yerde ZORLAMIYORDU. Prod merchant
 * bilgilerini paylaşan bir ortam (ve `PAYTR_TEST_MODE` tanımsızken varsayılan
 * `true`) gerçek-hash'li bir `test_mode=1` başarı bildirimi üretebilir; oid
 * eşleşirse sipariş SIFIR gelirle tamamlanır.
 */
describe("isRejectableTestModeSuccess", () => {
  it("production + test_mode=1 + success → REDDEDİLİR", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        status: "success",
        testMode: true,
      }),
    ).toBe(true);
  });

  it("production + canlı mod → kabul edilir", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        status: "success",
        testMode: false,
      }),
    ).toBe(false);
  });

  it("production dışı ortamlarda test modu normaldir", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "staging",
        status: "success",
        testMode: true,
      }),
    ).toBe(false);
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "development",
        status: "success",
        testMode: true,
      }),
    ).toBe(false);
  });

  it("başarısız bildirimler engellenmez (sipariş temizliği yapılabilsin)", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        status: "failed",
        testMode: true,
      }),
    ).toBe(false);
  });

  it("test_mode bilinmiyorsa engellenmez (mevcut davranış korunur)", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        status: "success",
        testMode: undefined,
      }),
    ).toBe(false);
  });
});
