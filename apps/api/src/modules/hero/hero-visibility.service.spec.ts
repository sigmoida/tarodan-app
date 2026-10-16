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
 * "false" kapalı; yazım iki anahtarı tek işlemde yapar ve web'in ana sayfa
 * hero etiketini tazeler.
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
    upsert: jest.fn().mockImplementation((args) => Promise.resolve(args)),
  };
  const $transaction = jest.fn().mockResolvedValue([]);
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

  it("updateHome yalnız gönderilen anahtarı 'true'/'false' olarak yazar ve tazeler", async () => {
    const { service, platformSetting, $transaction } = makeService();
    await service.updateHome({ app: false });

    expect(platformSetting.upsert).toHaveBeenCalledTimes(1);
    expect(platformSetting.upsert).toHaveBeenCalledWith({
      where: { settingKey: "hero_home_enabled_app" },
      create: expect.objectContaining({
        settingKey: "hero_home_enabled_app",
        settingValue: "false",
        settingType: "boolean",
      }),
      update: { settingValue: "false" },
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(notifyWebRevalidate).toHaveBeenCalledWith(["home:hero"]);
  });

  it("updateHome iki anahtarı tek işlemde yazar", async () => {
    const { service, platformSetting, $transaction } = makeService();
    await service.updateHome({ web: true, app: false });
    expect(
      platformSetting.upsert.mock.calls.map(([a]) => a.where.settingKey),
    ).toEqual(["hero_home_enabled_web", "hero_home_enabled_app"]);
    expect($transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it("boş yama yazmaz, tazelemez; güncel durumu döner", async () => {
    const { service, platformSetting, $transaction } = makeService();
    await expect(service.updateHome({})).resolves.toEqual({
      web: true,
      app: true,
    });
    expect(platformSetting.upsert).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(notifyWebRevalidate).not.toHaveBeenCalled();
  });
});
