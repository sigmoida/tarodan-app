import {
  HERO_HOME_ENABLED_SETTING,
  parseHeroHomeEnabled,
} from "@tarodan/types";
import { HeroVisibilityService } from "./hero-visibility.service";
import type { PrismaService } from "../../prisma";
import { notifyWebRevalidate } from "../../common/helpers/revalidate";

jest.mock("../../common/helpers/revalidate", () => ({
  notifyWebRevalidate: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Ana sayfa hero'sunun istemci başına anahtarı: satır yoksa açık, yalnız
 * "false" kapalı. Yazım önceki değeri aynı işlemde okur, yalnız değişen
 * anahtarı yazar (kimliğiyle döner) ve web'in ana sayfa hero etiketini yalnız
 * web anahtarı değiştiyse tazeler.
 */

function makeService(
  rows: Array<{ settingKey: string; settingValue: string }> = [],
) {
  const platformSetting = {
    findUnique: jest
      .fn()
      .mockImplementation(({ where }) =>
        Promise.resolve(
          rows.find((r) => r.settingKey === where.settingKey) ?? null,
        ),
      ),
    findMany: jest.fn().mockResolvedValue(rows),
    upsert: jest
      .fn()
      .mockImplementation(({ where }) =>
        Promise.resolve({ id: `id-${where.settingKey}` }),
      ),
  };
  // İnteraktif işlem: geri çağrı aynı sahte istemciyle koşar.
  const $transaction = jest
    .fn()
    .mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({ platformSetting }),
    );
  const service = new HeroVisibilityService({
    platformSetting,
    $transaction,
  } as unknown as PrismaService);
  return { service, platformSetting, $transaction };
}

describe("parseHeroHomeEnabled", () => {
  it.each([
    [undefined, true],
    [null, true],
    ["true", true],
    ["", true],
    ["false", false],
    [" FALSE ", false],
  ])("%p → %p", (value, expected) => {
    expect(parseHeroHomeEnabled(value as string | null | undefined)).toBe(
      expected,
    );
  });
});

describe("HeroVisibilityService", () => {
  beforeEach(() => (notifyWebRevalidate as jest.Mock).mockClear());

  it("anahtar adları sözleşmeyle aynı", () => {
    expect(HERO_HOME_ENABLED_SETTING).toEqual({
      web: "hero_home_enabled_web",
      app: "hero_home_enabled_app",
    });
  });

  it("satır yoksa açık sayılır", async () => {
    const { service, platformSetting } = makeService();
    await expect(service.isHomeEnabled("app")).resolves.toBe(true);
    expect(platformSetting.findUnique).toHaveBeenCalledWith({
      where: { settingKey: "hero_home_enabled_app" },
      select: { settingValue: true },
    });
  });

  it("istemcinin kendi anahtarını okur", async () => {
    const { service } = makeService([
      { settingKey: "hero_home_enabled_web", settingValue: "false" },
    ]);
    await expect(service.isHomeEnabled("web")).resolves.toBe(false);
    await expect(service.isHomeEnabled("app")).resolves.toBe(true);
  });

  it("getHome iki anahtarı birden döner", async () => {
    const { service, platformSetting } = makeService([
      { settingKey: "hero_home_enabled_app", settingValue: "false" },
    ]);
    await expect(service.getHome()).resolves.toEqual({ web: true, app: false });
    expect(platformSetting.findMany.mock.calls[0][0].where).toEqual({
      settingKey: { in: ["hero_home_enabled_web", "hero_home_enabled_app"] },
    });
  });

  it("updateHome yalnız gönderilen ve değişen anahtarı yazar, değişikliği kimliğiyle döner", async () => {
    const { service, platformSetting, $transaction } = makeService();
    await expect(service.updateHome({ app: false })).resolves.toEqual({
      visibility: { web: true, app: false },
      changes: [
        {
          platform: "app",
          settingId: "id-hero_home_enabled_app",
          settingKey: "hero_home_enabled_app",
          before: true,
          after: false,
        },
      ],
    });

    expect($transaction).toHaveBeenCalledTimes(1);
    // Önceki değer işlemin içinde okunur.
    expect(platformSetting.findMany).toHaveBeenCalledTimes(1);
    expect(platformSetting.upsert).toHaveBeenCalledTimes(1);
    expect(platformSetting.upsert).toHaveBeenCalledWith({
      where: { settingKey: "hero_home_enabled_app" },
      create: expect.objectContaining({
        settingKey: "hero_home_enabled_app",
        settingValue: "false",
        settingType: "boolean",
      }),
      update: { settingValue: "false" },
      select: { id: true },
    });
  });

  it("yalnız uygulama anahtarı değişince web tazelenmez", async () => {
    const { service } = makeService();
    await service.updateHome({ app: false });
    expect(notifyWebRevalidate).not.toHaveBeenCalled();
  });

  it("web anahtarı değişince web'in ana sayfa hero etiketi tazelenir", async () => {
    const { service } = makeService();
    await service.updateHome({ web: false });
    expect(notifyWebRevalidate).toHaveBeenCalledWith(["home:hero"]);
  });

  it("değer zaten aynıysa yazmaz, tazelemez, değişiklik dönmez", async () => {
    const { service, platformSetting } = makeService([
      { settingKey: "hero_home_enabled_web", settingValue: "false" },
    ]);
    await expect(
      service.updateHome({ web: false, app: true }),
    ).resolves.toEqual({ visibility: { web: false, app: true }, changes: [] });
    expect(platformSetting.upsert).not.toHaveBeenCalled();
    expect(notifyWebRevalidate).not.toHaveBeenCalled();
  });

  it("iki anahtar birden değişirse ikisi de aynı işlemde yazılır", async () => {
    const { service, platformSetting, $transaction } = makeService();
    const { changes } = await service.updateHome({ web: false, app: false });
    expect(changes.map((c) => c.settingId)).toEqual([
      "id-hero_home_enabled_web",
      "id-hero_home_enabled_app",
    ]);
    expect(platformSetting.upsert).toHaveBeenCalledTimes(2);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("boş yama işlem açmaz, yazmaz, tazelemez; güncel durumu döner", async () => {
    const { service, platformSetting, $transaction } = makeService();
    await expect(service.updateHome({})).resolves.toEqual({
      visibility: { web: true, app: true },
      changes: [],
    });
    expect(platformSetting.upsert).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(notifyWebRevalidate).not.toHaveBeenCalled();
  });
});
