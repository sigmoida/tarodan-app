import {
  NETSIS_ACCOUNT_CODE_MAX,
  NETSIS_CARI_CODE_MAX,
  NETSIS_ITEM_CODE_MAX,
  NETSIS_SERIAL_LENGTH,
  NETSIS_SERIAL_PATTERN,
  isValidNetsisSerial,
} from "@tarodan/types";

/**
 * `@tarodan/types` → netsis-settings: API ayrıştırıcıları ve admin ekranı aynı
 * sınırları buradan okur. Değerler bilerek literal kilitlenir — bir sınırın
 * değişmesi iki uygulamayı birden etkiler, sessizce kaymamalı.
 */
describe("netsis-settings (shared)", () => {
  it("pins the code length limits (VERIFY values)", () => {
    expect(NETSIS_CARI_CODE_MAX).toBe(15);
    expect(NETSIS_ITEM_CODE_MAX).toBe(35);
    expect(NETSIS_ACCOUNT_CODE_MAX).toBe(30);
    expect(NETSIS_SERIAL_LENGTH).toBe(3);
    expect(NETSIS_SERIAL_PATTERN.source).toBe("^[A-Z0-9]{3}$");
  });

  it.each(["TRD", "EAR", "E2F", "123"])("accepts serial %p", (value) => {
    expect(isValidNetsisSerial(value)).toBe(true);
    expect(NETSIS_SERIAL_PATTERN.test(value)).toBe(true);
  });

  it.each(["", "EA", "EARX", "ear", "E-R", " EAR", "EAR "])(
    "rejects serial %p (expects an already-normalized value)",
    (value) => {
      expect(isValidNetsisSerial(value)).toBe(false);
    },
  );
});
