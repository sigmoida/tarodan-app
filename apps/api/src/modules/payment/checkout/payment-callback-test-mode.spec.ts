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
        appEnv: "production",
        status: "success",
        testMode: true,
      }),
    ).toBe(true);
  });

  it("production + canlı mod → kabul edilir", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        appEnv: "production",
        status: "success",
        testMode: false,
      }),
    ).toBe(false);
  });

  it("production dışı ortamlarda test modu normaldir", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "development",
        appEnv: undefined,
        status: "success",
        testMode: true,
      }),
    ).toBe(false);
  });

  /**
   * Staging `NODE_ENV=production` + `APP_ENV=staging` + zorunlu
   * `PAYTR_TEST_MODE=true` ile koşar: her bildirim test_mode=1, test hesabı
   * olmayan alıcının ödemesi isTest=false. Eskiden yalnız NODE_ENV'e bakıldığı
   * için staging'deki HER başarılı ödeme reddediliyor, kart hiç kaydedilmiyordu.
   */
  it("staging (NODE_ENV=production + APP_ENV=staging) + test_mode=1 → kabul edilir", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        appEnv: "staging",
        status: "success",
        testMode: true,
        paymentIsTest: false,
      }),
    ).toBe(false);
  });

  it("APP_ENV tanımsız/production optimize derleme canlı sayılır (fail-closed)", () => {
    for (const appEnv of [undefined, "production", "", "stage"]) {
      expect(
        isRejectableTestModeSuccess({
          nodeEnv: "production",
          appEnv,
          status: "success",
          testMode: true,
          paymentIsTest: false,
        }),
      ).toBe(true);
    }
  });

  it("başarısız bildirimler engellenmez (sipariş temizliği yapılabilsin)", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        appEnv: "production",
        status: "failed",
        testMode: true,
      }),
    ).toBe(false);
  });

  it("test şeridi ödemesi + test_mode=1 → kabul (canlı merchant'ta test kartı)", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        appEnv: "production",
        status: "success",
        testMode: true,
        paymentIsTest: true,
      }),
    ).toBe(false);
  });

  it("test şeridi ödemesi + test_mode=0 başarı → REDDEDİLİR (test hattı gerçek para taşımaz)", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        appEnv: "production",
        status: "success",
        testMode: false,
        paymentIsTest: true,
      }),
    ).toBe(true);
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        appEnv: "production",
        status: "failed",
        testMode: false,
        paymentIsTest: true,
      }),
    ).toBe(false);
  });

  it("test_mode bilinmiyorsa engellenmez (mevcut davranış korunur)", () => {
    expect(
      isRejectableTestModeSuccess({
        nodeEnv: "production",
        appEnv: "production",
        status: "success",
        testMode: undefined,
      }),
    ).toBe(false);
  });
});
