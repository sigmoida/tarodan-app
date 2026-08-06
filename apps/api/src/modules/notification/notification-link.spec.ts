import { NotificationType } from "./dto";
import {
  NOTIFICATION_LINKS,
  isSafeFreeLink,
  normalizeLegacyNotificationLink,
  requiredFieldsFor,
  resolveWebNotificationLink,
} from "./notification-link";

/**
 * Bildirim hedeflerinin sözleşmesi.
 *
 * Regresyon: link üç ayrı yerde üretiliyordu ve push worker `data` alanlarına
 * bakarak web'de OLMAYAN yollar kuruyordu (`/orders/:id`, `/offers?tab=...`,
 * `/trades/:id`, `/messages?thread=`). Tıklanan bildirim 404'e gidiyordu.
 */

const ALL_TYPES = Object.values(NotificationType);

/** Her tip için yeterli örnek veri. */
const SAMPLE: Record<string, string> = {
  orderId: "order-1",
  productId: "product-1",
  tradeId: "trade-1",
  threadId: "thread-1",
  collectionId: "collection-1",
  followerId: "follower-1",
  promotionLink: "/listings",
  offerLink: "/listings",
  announcementLink: "https://tarodan.com.tr/duyuru",
};

const sampleFor = (type: NotificationType) =>
  Object.fromEntries(
    requiredFieldsFor(type).map((field) => [field, SAMPLE[field] ?? "x"]),
  );

describe("bildirim hedefleri", () => {
  it("HER bildirim tipi için hedef tanımlıdır", () => {
    for (const type of ALL_TYPES) {
      expect(NOTIFICATION_LINKS[type]).toBeDefined();
    }
  });

  it.each(ALL_TYPES)("%s — çözülen linkte {{...}} kalmaz", (type) => {
    const link = resolveWebNotificationLink(type, sampleFor(type));
    if (link === null) {
      // Hedefi olmayan tipler (yalnız e-posta) link üretmez.
      expect(NOTIFICATION_LINKS[type].kind).toBe("none");
      return;
    }
    expect(link).not.toContain("{{");
    expect(link).not.toContain("}}");
  });

  it.each(ALL_TYPES)("%s — zorunlu alan eksikse link ÜRETİLMEZ", (type) => {
    const required = requiredFieldsFor(type);
    if (!required.length) return;
    expect(resolveWebNotificationLink(type, {})).toBeNull();
  });

  describe("hedef matrisi", () => {
    const cases: Array<[NotificationType, Record<string, string>, string]> = [
      [NotificationType.ORDER_CREATED, { orderId: "o1" }, "/profile/orders/o1"],
      [NotificationType.ORDER_SHIPPED, { orderId: "o1" }, "/profile/orders/o1"],
      [NotificationType.OFFER_RECEIVED, {}, "/profile/offers?tab=received"],
      [NotificationType.OFFER_COUNTER, {}, "/profile/offers?tab=sent"],
      [
        NotificationType.TRADE_RECEIVED,
        { tradeId: "t1" },
        "/profile/trades/t1",
      ],
      [
        NotificationType.CARGO_CODE_READY,
        { tradeId: "t1" },
        "/profile/trades/t1",
      ],
      [
        NotificationType.NEW_MESSAGE,
        { threadId: "th1" },
        "/profile/messages?thread=th1",
      ],
      [NotificationType.PRICE_DROP, { productId: "p1" }, "/listings/p1"],
      [
        NotificationType.ORDER_CANCELLED_OUT_OF_STOCK,
        { productId: "p1" },
        "/products/unavailable/p1",
      ],
      [
        NotificationType.COLLECTION_LIKED,
        { collectionId: "c1" },
        "/collections/c1",
      ],
    ];

    it.each(cases)("%s → %j = %s", (type, data, expected) => {
      expect(resolveWebNotificationLink(type, data)).toBe(expected);
    });
  });

  describe("hedef kitle", () => {
    /**
     * Aynı sipariş, farklı alıcı: hedef `orderId` varlığından değil TİPTEN
     * seçilir. Push worker `data.orderId` görünce hep alıcı ekranına
     * gönderiyordu.
     */
    it("alıcı ve satıcı sipariş bildirimleri AYRI ekrana gider", () => {
      expect(
        resolveWebNotificationLink(NotificationType.ORDER_CANCELLED, {
          orderId: "o1",
        }),
      ).toBe("/profile/orders/o1");
      expect(
        resolveWebNotificationLink(NotificationType.ORDER_CANCELLED_SELLER, {
          orderId: "o1",
        }),
      ).toBe("/seller/orders/o1");
    });

    it("iade bildirimlerinde satıcı tarafı satıcı ekranına gider", () => {
      expect(
        resolveWebNotificationLink(NotificationType.REFUND_COMPLETED, {
          orderId: "o1",
        }),
      ).toBe("/profile/orders/o1");
      expect(
        resolveWebNotificationLink(NotificationType.REFUND_COMPLETED_SELLER, {
          orderId: "o1",
        }),
      ).toBe("/seller/orders/o1");
    });
  });

  describe("kaçış", () => {
    it("dinamik parça URL-encode edilir", () => {
      expect(
        resolveWebNotificationLink(NotificationType.ORDER_CREATED, {
          orderId: "a/../b?x=1",
        }),
      ).toBe("/profile/orders/a%2F..%2Fb%3Fx%3D1");
    });
  });

  describe("serbest linkler", () => {
    it("HTTPS ve site-içi yol kabul edilir", () => {
      expect(
        resolveWebNotificationLink(NotificationType.PROMOTION, {
          promotionLink: "https://tarodan.com.tr/kampanya",
        }),
      ).toBe("https://tarodan.com.tr/kampanya");
      expect(
        resolveWebNotificationLink(NotificationType.SPECIAL_OFFER, {
          offerLink: "/listings",
        }),
      ).toBe("/listings");
    });

    it.each([
      "javascript:alert(1)",
      "//evil.example.com",
      "http://tarodan.com.tr",
      "not a url",
      "/kampanya/{{id}}",
    ])("güvensiz serbest link reddedilir: %s", (link) => {
      expect(
        resolveWebNotificationLink(NotificationType.PROMOTION, {
          promotionLink: link,
        }),
      ).toBeNull();
      expect(isSafeFreeLink(link)).toBe(false);
    });

    it("link yoksa null döner (bozuk hedef kaydedilmez)", () => {
      expect(
        resolveWebNotificationLink(NotificationType.SYSTEM_ANNOUNCEMENT, {}),
      ).toBeNull();
    });
  });

  describe("eski kayıtların düzeltilmesi", () => {
    it.each([
      ["/orders/o1", "/profile/orders/o1"],
      ["/orders", "/profile/orders"],
      ["/offers?tab=received", "/profile/offers?tab=received"],
      ["/trades/t1", "/profile/trades/t1"],
      ["/messages?thread=th1", "/profile/messages?thread=th1"],
      ["/products/p1", "/listings/p1"],
      // Zaten doğru olanlar değişmez.
      ["/profile/orders/o1", "/profile/orders/o1"],
      ["/listings/p1", "/listings/p1"],
      ["/products/unavailable/p1", "/products/unavailable/p1"],
    ])("%s → %s", (legacy, expected) => {
      expect(normalizeLegacyNotificationLink(legacy)).toBe(expected);
    });

    it("çözülmemiş değişken taşıyan eski link kullanılamaz", () => {
      expect(normalizeLegacyNotificationLink("/orders/{{orderId}}")).toBeNull();
    });

    it("boş/geçersiz link null döner", () => {
      expect(normalizeLegacyNotificationLink(null)).toBeNull();
      expect(normalizeLegacyNotificationLink("")).toBeNull();
      expect(normalizeLegacyNotificationLink("//evil.example.com")).toBeNull();
      expect(normalizeLegacyNotificationLink("javascript:alert(1)")).toBeNull();
    });
  });
});
