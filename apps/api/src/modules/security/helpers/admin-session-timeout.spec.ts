import {
  ADMIN_SESSION_TIMEOUT_SETTING,
  adminSessionExpiryFrom,
  resetAdminSessionTimeoutCache,
  resolveAdminSessionTimeoutMinutes,
} from "./admin-session-timeout";

const reader = (settingValue: string | null) => ({
  platformSetting: {
    findUnique: jest
      .fn()
      .mockResolvedValue(settingValue === null ? null : { settingValue }),
  },
});

describe("resolveAdminSessionTimeoutMinutes", () => {
  beforeEach(() => resetAdminSessionTimeoutCache());

  it("ayardaki değeri kullanır", async () => {
    await expect(
      resolveAdminSessionTimeoutMinutes(reader("240")),
    ).resolves.toBe(240);
  });

  it("satır yoksa varsayılana düşer", async () => {
    await expect(resolveAdminSessionTimeoutMinutes(reader(null))).resolves.toBe(
      ADMIN_SESSION_TIMEOUT_SETTING.default,
    );
  });

  it.each([
    ["", "boş"],
    ["abc", "sayı olmayan"],
    ["0", "sıfır"],
    ["1", "min altı"],
  ])("geçersiz değer (%s) varsayılana düşer: %s", async (value) => {
    resetAdminSessionTimeoutCache();
    await expect(
      resolveAdminSessionTimeoutMinutes(reader(value)),
    ).resolves.toBe(ADMIN_SESSION_TIMEOUT_SETTING.default);
  });

  it("okuma hatasında oturumları kesmek yerine varsayılanla sürer", async () => {
    const failing = {
      platformSetting: {
        findUnique: jest.fn().mockRejectedValue(new Error("db down")),
      },
    };
    await expect(resolveAdminSessionTimeoutMinutes(failing)).resolves.toBe(
      ADMIN_SESSION_TIMEOUT_SETTING.default,
    );
  });

  it("TTL boyunca cache'ten okur, sonra yeniden sorar", async () => {
    // Bu çözücü HER admin isteğinde çalışıyor; cache olmadan en sıcak yola
    // istek başına bir sorgu daha eklerdi.
    const db = reader("120");
    const t0 = 1_000_000;
    await resolveAdminSessionTimeoutMinutes(db, t0);
    await resolveAdminSessionTimeoutMinutes(db, t0 + 59_000);
    expect(db.platformSetting.findUnique).toHaveBeenCalledTimes(1);

    await resolveAdminSessionTimeoutMinutes(db, t0 + 61_000);
    expect(db.platformSetting.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("adminSessionExpiryFrom", () => {
  it("verilen andan itibaren dakikayı ekler", () => {
    const from = new Date("2026-09-07T10:00:00.000Z");
    expect(adminSessionExpiryFrom(30, from).toISOString()).toBe(
      "2026-09-07T10:30:00.000Z",
    );
  });
});
