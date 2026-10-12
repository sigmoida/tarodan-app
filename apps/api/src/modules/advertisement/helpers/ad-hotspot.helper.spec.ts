import { BadRequestException } from "@nestjs/common";
import { AD_HOTSPOT_MAX } from "@tarodan/types";
import {
  adCountsPlainClick,
  adHasImage,
  assertAdHotspotsValid,
  parseAdHotspotParam,
  planAdHotspotReplace,
  resolveAdClickTargets,
  type AdHotspotPayload,
} from "./ad-hotspot.helper";

/**
 * Görselli reklamda tıklama yalnız alanlarda; görselsiz reklamda tek
 * `linkUrl`. Kurallar SONUÇ reklam (saklı + yama) üzerinde işler; geometri
 * kuralları `validateAdHotspots`'tan (tek kaynak) gelir.
 */

const H1 = "11111111-1111-4111-8111-111111111111";
const H2 = "22222222-2222-4222-8222-222222222222";
const IMG = "https://cdn.test/a.png";

const spot = (over: Partial<AdHotspotPayload> = {}): AdHotspotPayload => ({
  x: 0,
  y: 0,
  width: 0.5,
  height: 0.5,
  label: "Alan",
  linkUrl: "/x",
  ...over,
});

const thrown = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as BadRequestException;
  }
  throw new Error("beklenen hata fırlatılmadı");
};

describe("adHasImage", () => {
  it.each([
    [IMG, true],
    [null, false],
    [undefined, false],
    ["", false],
    ["   ", false],
  ])("%p → %p", (value, expected) => {
    expect(adHasImage(value)).toBe(expected);
  });
});

describe("assertAdHotspotsValid", () => {
  it("geçerli ve boş liste geçer", () => {
    expect(() => assertAdHotspotsValid([])).not.toThrow();
    expect(() =>
      assertAdHotspotsValid([spot(), spot({ x: 0.5 })]),
    ).not.toThrow();
  });

  it.each([
    ["outOfBounds", spot({ x: 0.8 })],
    ["tooSmall", spot({ width: 0.01 })],
    ["labelRequired", spot({ label: "  " })],
    ["labelTooLong", spot({ label: "x".repeat(81) })],
    ["linkRequired", spot({ linkUrl: "" })],
  ])("%s → 400, 1 tabanlı sıra parametresiyle", (code, bad) => {
    const error = thrown(() => assertAdHotspotsValid([spot(), bad]));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({
      i18nKey: "server.advertisement.hotspotInvalid",
      i18nParams: { code, index: 1, position: 2 },
    });
  });

  it("overlap çakıştığı alanı da bildirir", () => {
    const error = thrown(() =>
      assertAdHotspotsValid([spot(), spot({ x: 0.25, y: 0.25 })]),
    );
    expect(error.getResponse()).toMatchObject({
      i18nParams: { code: "overlap", position: 2, other: 1 },
    });
  });

  it("tooMany sırasız; mesaj için tavanı taşır", () => {
    const many = Array.from({ length: AD_HOTSPOT_MAX + 1 }, (_, i) =>
      spot({ x: (i % 10) * 0.1, y: Math.floor(i / 10) * 0.5, width: 0.1 }),
    );
    const error = thrown(() => assertAdHotspotsValid(many));
    expect(error.getResponse()).toMatchObject({
      i18nKey: "server.advertisement.hotspotInvalid",
      i18nParams: {
        code: "tooMany",
        index: null,
        position: null,
        max: AD_HOTSPOT_MAX,
      },
    });
  });
});

describe("resolveAdClickTargets — sonuç reklam üzerinde", () => {
  describe("görsel var", () => {
    it("linkUrl gönderilse de null", () => {
      expect(
        resolveAdClickTargets({ imageUrl: IMG }, { linkUrl: "/x" }).linkUrl,
      ).toBeNull();
      expect(
        resolveAdClickTargets({ imageUrl: null }, { imageUrl: IMG, linkUrl: "/x" })
          .linkUrl,
      ).toBeNull();
    });

    it("alan listesi gönderilirse doğrulanıp kümeyi değiştirir", () => {
      const hotspots = [spot()];
      expect(
        resolveAdClickTargets({ imageUrl: IMG }, { hotspots }).hotspots,
      ).toEqual({ kind: "replace", hotspots });
    });

    it("geçersiz liste 400", () => {
      expect(() =>
        resolveAdClickTargets(
          { imageUrl: IMG },
          { hotspots: [spot({ width: 2 })] },
        ),
      ).toThrow(BadRequestException);
    });

    it("görsel değişti + alan gönderilmedi → eski alanlar silinir", () => {
      expect(
        resolveAdClickTargets(
          { imageUrl: IMG },
          { imageUrl: "https://cdn.test/b.png" },
        ).hotspots,
      ).toEqual({ kind: "clear" });
    });

    it("aynı görsel yeniden gönderildi ya da görsele dokunulmadı → alanlar kalır", () => {
      expect(
        resolveAdClickTargets({ imageUrl: IMG }, { imageUrl: IMG }).hotspots,
      ).toEqual({ kind: "keep" });
      expect(resolveAdClickTargets({ imageUrl: IMG }, {}).hotspots).toEqual({
        kind: "keep",
      });
    });
  });

  describe("görsel yok", () => {
    it("linkUrl yamanın anlamını taşır (undefined = dokunma)", () => {
      expect(
        resolveAdClickTargets({ imageUrl: null }, { linkUrl: "/x" }).linkUrl,
      ).toBe("/x");
      expect(
        resolveAdClickTargets({ imageUrl: null }, {}).linkUrl,
      ).toBeUndefined();
      expect(
        resolveAdClickTargets({ imageUrl: null }, { linkUrl: null }).linkUrl,
      ).toBeNull();
    });

    it("alan gönderilirse 400 hotspotsNeedImage", () => {
      const error = thrown(() =>
        resolveAdClickTargets({ imageUrl: null }, { hotspots: [spot()] }),
      );
      expect(error.getResponse()).toEqual({
        i18nKey: "server.advertisement.hotspotsNeedImage",
      });
    });

    it("görsel bu yamayla kalktıysa alanlar silinir", () => {
      expect(
        resolveAdClickTargets({ imageUrl: IMG }, { imageUrl: null }).hotspots,
      ).toEqual({ kind: "clear" });
      expect(
        resolveAdClickTargets({ imageUrl: IMG }, { imageUrl: null, hotspots: [] })
          .hotspots,
      ).toEqual({ kind: "clear" });
    });

    it("zaten görselsizse alanlara dokunulmaz (boş liste de kabul)", () => {
      expect(resolveAdClickTargets({ imageUrl: null }, {}).hotspots).toEqual({
        kind: "keep",
      });
      expect(
        resolveAdClickTargets({ imageUrl: null }, { hotspots: [] }).hotspots,
      ).toEqual({ kind: "keep" });
    });
  });
});

describe("planAdHotspotReplace", () => {
  it("kayıtlı id güncellenir, kimliksiz yeni; sıra = sortOrder; etiket kırpılır", () => {
    const plan = planAdHotspotReplace(
      [H1, H2],
      [spot({ id: H2, label: " Sağ " }), spot({ x: 0.5 })],
    );
    expect(plan.keepIds).toEqual([H2]);
    expect(plan.update).toEqual([
      {
        id: H2,
        data: {
          x: 0,
          y: 0,
          width: 0.5,
          height: 0.5,
          label: "Sağ",
          linkUrl: "/x",
          sortOrder: 0,
        },
      },
    ]);
    expect(plan.create).toEqual([
      {
        x: 0.5,
        y: 0,
        width: 0.5,
        height: 0.5,
        label: "Alan",
        linkUrl: "/x",
        sortOrder: 1,
      },
    ]);
  });

  it("bu reklama ait olmayan id yeni alan olur", () => {
    const plan = planAdHotspotReplace([H1], [spot({ id: H2 })]);
    expect(plan.keepIds).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).not.toHaveProperty("id");
  });

  it("aynı id iki kez gelirse ikincisi yeni alandır", () => {
    const plan = planAdHotspotReplace(
      [H1],
      [spot({ id: H1 }), spot({ id: H1, x: 0.5 })],
    );
    expect(plan.keepIds).toEqual([H1]);
    expect(plan.update).toHaveLength(1);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].sortOrder).toBe(1);
  });
});

describe("parseAdHotspotParam", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    [H1, H1],
    ["not-a-uuid", null],
    ["1; DROP TABLE x", null],
    [[H1, H2], null],
  ])("%p → %p", (raw, expected) => {
    expect(parseAdHotspotParam(raw)).toBe(expected);
  });
});

describe("adCountsPlainClick", () => {
  it.each([
    ["görselsiz + bağlantılı", { imageUrl: null, linkUrl: "/x" }, true],
    ["görselsiz + bağlantısız", { imageUrl: null, linkUrl: null }, false],
    ["görselli (alan şart)", { imageUrl: IMG, linkUrl: null }, false],
    ["görselli + eski bağlantı", { imageUrl: IMG, linkUrl: "/x" }, false],
  ])("%s → %p", (_d, ad, expected) => {
    expect(adCountsPlainClick(ad)).toBe(expected);
  });
});
