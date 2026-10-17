import { NotFoundException } from "@nestjs/common";
import { Prisma, type TrustBadge } from "@prisma/client";
import { TrustBadgeService } from "./trust-badge.service";
import { fillTimingTokens } from "./helpers/trust-badge.mapper";
import type { PrismaService } from "../../prisma";
import { notifyWebRevalidate } from "../../common/helpers/revalidate";

jest.mock("../../common/helpers/revalidate", () => ({
  notifyWebRevalidate: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Güven rozetleri: açık olanlar sırasıyla; metindeki herkese açık süre
 * belirteci (`{returnWindowDays}`) Süreler ve Kurallar'dan dolar, iç süreler
 * vitrine sızmaz; admin ham metni görür; yazım `home:trust`'ı tazeler.
 */

const row = (over: Partial<TrustBadge> = {}): TrustBadge => ({
  id: "badge-1",
  isActive: true,
  displayOrder: 0,
  icon: "arrow-path",
  title: { tr: "İade İmkanı", en: "Easy Returns" },
  description: {
    tr: "{returnWindowDays} gün koşulsuz iade",
    en: "{returnWindowDays}-day unconditional returns",
  },
  hideOnIos: false,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-02T00:00:00Z"),
  ...over,
});

/** Süre okuması: `returnWindowDays` ayarı 21 gün. */
const timingSetting = {
  settingKey: "return_window_days",
  settingValue: "21",
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

function makeService(badges: TrustBadge[] = [row()]) {
  const trustBadge = {
    findMany: jest.fn().mockResolvedValue(badges),
    findUnique: jest.fn().mockResolvedValue(badges[0] ?? null),
    create: jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve(row({ ...data }))),
    update: jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve(row({ ...data }))),
    delete: jest.fn().mockResolvedValue(row()),
    count: jest.fn().mockResolvedValue(badges.length),
    aggregate: jest.fn().mockResolvedValue({ _max: { displayOrder: 5 } }),
  };
  const platformSetting = {
    findMany: jest.fn().mockResolvedValue([timingSetting]),
  };
  const $transaction = jest.fn().mockResolvedValue([]);
  const service = new TrustBadgeService({
    trustBadge,
    platformSetting,
    $transaction,
  } as unknown as PrismaService);
  return { service, trustBadge, platformSetting, $transaction };
}

describe("fillTimingTokens", () => {
  it("herkese açık süreyi doldurur, iç ve bilinmeyen belirteci olduğu gibi bırakır", () => {
    expect(
      fillTimingTokens(
        "{returnWindowDays} gün · {paymentReservationMinutes} · {x}",
        {
          returnWindowDays: 14,
          paymentReservationMinutes: 30,
        },
      ),
    ).toBe("14 gün · {paymentReservationMinutes} · {x}");
  });
});

describe("TrustBadgeService — vitrin okuması", () => {
  it("açık rozetleri sırasıyla okur", async () => {
    const { service, trustBadge } = makeService();
    await service.listLive();
    expect(trustBadge.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
  });

  it("public şekil: süre belirteci güncel değerle dolar, iki dil döner", async () => {
    const { service, platformSetting } = makeService();
    const badges = await service.listLive();
    expect(platformSetting.findMany).toHaveBeenCalled();
    expect(badges).toEqual([
      {
        id: "badge-1",
        icon: "arrow-path",
        title: { tr: "İade İmkanı", en: "Easy Returns" },
        description: {
          tr: "21 gün koşulsuz iade",
          en: "21-day unconditional returns",
        },
        hideOnIos: false,
      },
    ]);
  });

  it("mobilde gizli rozetin bayrağı public şekilde taşınır (süzmeyi istemci yapar)", async () => {
    const { service } = makeService([row({ hideOnIos: true })]);
    const [badge] = await service.listLive();
    expect(badge.hideOnIos).toBe(true);
  });

  it("süreler okunamazsa kayıt varsayılanına (14) düşer, rozet kaybolmaz", async () => {
    const { service, platformSetting } = makeService();
    platformSetting.findMany.mockRejectedValueOnce(new Error("db down"));
    const [badge] = await service.listLive();
    expect(badge.description?.tr).toBe("14 gün koşulsuz iade");
  });

  it("bilinmeyen ikonlu ya da başlıksız satır gösterilmez", async () => {
    const { service } = makeService([
      row({ id: "ok" }),
      row({ id: "bad-icon", icon: "rocket" }),
      row({ id: "no-title", title: { en: "Only English" } }),
    ]);
    const badges = await service.listLive();
    expect(badges.map((b) => b.id)).toEqual(["ok"]);
  });

  it("rozet yoksa süre okumaz", async () => {
    const { service, platformSetting } = makeService([]);
    await expect(service.listLive()).resolves.toEqual([]);
    expect(platformSetting.findMany).not.toHaveBeenCalled();
  });
});

describe("TrustBadgeService — admin", () => {
  beforeEach(() => (notifyWebRevalidate as jest.Mock).mockClear());

  it("admin metni ham (belirteçli) görür", async () => {
    const { service } = makeService();
    const [badge] = await service.list();
    expect(badge.description).toEqual({
      tr: "{returnWindowDays} gün koşulsuz iade",
      en: "{returnWindowDays}-day unconditional returns",
    });
    expect(badge).toMatchObject({
      isActive: true,
      displayOrder: 0,
      createdAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("oluştururken metni normalize eder, sona ekler, home:trust'ı tazeler", async () => {
    const { service, trustBadge } = makeService();
    await service.create({
      icon: "truck",
      title: { tr: " Güvenli Kargo ", en: "" },
    } as never);
    expect(trustBadge.create.mock.calls[0][0].data).toEqual({
      icon: "truck",
      title: { tr: "Güvenli Kargo", en: null },
      description: Prisma.DbNull,
      isActive: true,
      hideOnIos: false,
      displayOrder: 6,
    });
    expect(notifyWebRevalidate).toHaveBeenCalledWith(["home:trust"]);
  });

  it("oluştururken hideOnIos verilirse yazılır", async () => {
    const { service, trustBadge } = makeService();
    await service.create({
      icon: "truck",
      title: { tr: "Mobilde yok" },
      hideOnIos: true,
    } as never);
    expect(trustBadge.create.mock.calls[0][0].data.hideOnIos).toBe(true);
  });

  it("admin şekli hideOnIos taşır", async () => {
    const { service } = makeService([row({ hideOnIos: true })]);
    const [badge] = await service.list();
    expect(badge.hideOnIos).toBe(true);
  });

  it("güncellemede hideOnIos yazılır, verilmezse dokunulmaz", async () => {
    const { service, trustBadge } = makeService();
    await service.update("badge-1", { hideOnIos: true } as never);
    expect(trustBadge.update.mock.calls[0][0].data.hideOnIos).toBe(true);
    await service.update("badge-1", { isActive: false } as never);
    expect(trustBadge.update.mock.calls[1][0].data.hideOnIos).toBeUndefined();
  });

  it("güncellemede null açıklamayı temizler, undefined dokunmaz", async () => {
    const { service, trustBadge } = makeService();
    await service.update("badge-1", { description: null } as never);
    const data = trustBadge.update.mock.calls[0][0].data;
    expect(data.description).toBe(Prisma.DbNull);
    expect(data.title).toBeUndefined();
    expect(data.icon).toBeUndefined();
  });

  it("bilinmeyen rozet → 404", async () => {
    const { service, trustBadge } = makeService();
    trustBadge.findUnique.mockResolvedValueOnce(null);
    await expect(service.remove("x")).rejects.toBeInstanceOf(NotFoundException);
    expect(trustBadge.delete).not.toHaveBeenCalled();
  });

  it("sıralama: bilinmeyen kimlik 404, geçerli dizi displayOrder olur", async () => {
    const { service, trustBadge, $transaction } = makeService();
    trustBadge.count.mockResolvedValueOnce(1);
    await expect(service.reorder(["a", "b"])).rejects.toBeInstanceOf(
      NotFoundException,
    );

    trustBadge.count.mockResolvedValueOnce(2);
    await service.reorder(["b", "a"]);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(trustBadge.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "b" }, data: { displayOrder: 0 } },
      { where: { id: "a" }, data: { displayOrder: 1 } },
    ]);
    expect(notifyWebRevalidate).toHaveBeenCalledWith(["home:trust"]);
  });
});
