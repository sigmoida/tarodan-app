import { NotificationType } from "./dto";
import {
  NOTIFICATION_LINKS,
  isSafeFreeLink,
  normalizeLegacyNotificationLink,
  isKnownNotificationType,
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
  link: "https://tarodan.com.tr/duyuru",
  adminLink: "https://admin.tarodan.com.tr/operations/refund-requests/refund-1",
  audience: "buyer",
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
    const spec = NOTIFICATION_LINKS[type];
    // Kontrollü fallback'i olan tek tip (sepet ödemesi) listeye düşer; diğerleri
    // linksiz kalır — yanlış kayda götürmektense hedefsiz kalmak yeğdir.
    const expected = spec.kind === "pattern" ? (spec.fallback ?? null) : null;
    expect(resolveWebNotificationLink(type, {})).toBe(expected);
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
      // Sipariş kargo kodu satıcının sipariş ekranına gider; takas bacağı
      // (orderId yok) takas listesine düşer.
      [
        NotificationType.CARGO_CODE_READY,
        { orderId: "o1" },
        "/seller/orders/o1",
      ],
      [NotificationType.CARGO_CODE_READY, { tradeId: "t1" }, "/profile/trades"],
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

  describe("hedef kitle (audience)", () => {
    /**
     * Regresyon: bazı tipler AYNI tiple hem alıcıya hem satıcıya gidiyor
     * (ORDER_AUTO_COMPLETED, ORDER_FORCE_COMPLETED_BY_ADMIN) ya da yalnız
     * satıcıya gidiyor (ORDER_PAID, ORDER_MANUALLY_CONFIRMED,
     * ORDER_PREPARING_DEADLINE_WARNING). Hedef tek başına tipten çıkarılamaz.
     */
    const AUDIENCE_TYPES = [
      NotificationType.ORDER_PAID,
      NotificationType.ORDER_MANUALLY_CONFIRMED,
      NotificationType.ORDER_PREPARING_DEADLINE_WARNING,
      NotificationType.ORDER_AUTO_COMPLETED,
      NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN,
      NotificationType.PAYMENT_REFUNDED,
      // Kargo gecikmesi alıcıya VE satıcıya gider (order-scheduler).
      NotificationType.ORDER_SHIPMENT_DELAYED,
      // İade iptali iki yönlü: alıcı iptal edince satıcıya, sistem/admin
      // kapatınca alıcıya gider — sabit alıcı deseni satıcıyı yanlış ekrana
      // götürüyordu.
      NotificationType.REFUND_CANCELLED,
    ];

    it.each(AUDIENCE_TYPES)("%s — audience ekranı seçer", (type) => {
      expect(
        resolveWebNotificationLink(type, { orderId: "o1", audience: "seller" }),
      ).toBe("/seller/orders/o1");
      expect(
        resolveWebNotificationLink(type, { orderId: "o1", audience: "buyer" }),
      ).toBe("/profile/orders/o1");
    });

    /**
     * Regresyon: `audience` yoksa ALICI varsayılıyordu. Satıcıya giden bir
     * bildirim sessizce alıcının ekranını açıyor, hata hiçbir yerde
     * görünmüyordu. Artık üretici hedef kitleyi söylemek zorunda.
     */
    it.each(AUDIENCE_TYPES)("%s — audience yoksa link ÜRETİLMEZ", (type) => {
      expect(resolveWebNotificationLink(type, { orderId: "o1" })).toBeNull();
      expect(
        resolveWebNotificationLink(type, { orderId: "o1", audience: "" }),
      ).toBeNull();
      // Tanınmayan değer de sessizce alıcıya düşmemeli.
      expect(
        resolveWebNotificationLink(type, { orderId: "o1", audience: "admin" }),
      ).toBeNull();
    });

    it.each(AUDIENCE_TYPES)("%s — audience zorunlu alan sayılır", (type) => {
      expect(requiredFieldsFor(type)).toContain("audience");
    });

    /**
     * `payment_confirmed` yalnız ALICIYA gider; satıcının karşılığı
     * `payment_received`. Audience ile ikiye ayrılması yanlıştı.
     */
    it("payment_confirmed alıcıya gider, audience istemez", () => {
      expect(
        resolveWebNotificationLink(NotificationType.PAYMENT_CONFIRMED, {
          orderId: "o1",
        }),
      ).toBe("/profile/orders/o1");
      expect(
        requiredFieldsFor(NotificationType.PAYMENT_CONFIRMED),
      ).not.toContain("audience");
    });

    /**
     * Sepet ödemesi TEK sipariş göstermiyor: grup bildirimi yalnız
     * `checkoutGroupId` taşıyordu ve hedef üretilemiyordu. Temsilci sipariş
     * varsa detayına, yoksa listeye gider — hedefsiz kalmaz.
     */
    describe("grup ödeme bildirimi", () => {
      it("temsilci sipariş varsa detayına gider", () => {
        expect(
          resolveWebNotificationLink(NotificationType.PAYMENT_CONFIRMED, {
            checkoutGroupId: "g1",
            groupNumber: "GRP-1",
            orderId: "o1",
          }),
        ).toBe("/profile/orders/o1");
      });

      it("temsilci sipariş yoksa sipariş listesine düşer", () => {
        expect(
          resolveWebNotificationLink(NotificationType.PAYMENT_CONFIRMED, {
            checkoutGroupId: "g1",
            groupNumber: "GRP-1",
          }),
        ).toBe("/profile/orders");
      });

      it("tekil ödeme bildirimi listeye DÜŞMEZ", () => {
        expect(
          resolveWebNotificationLink(NotificationType.PAYMENT_CONFIRMED, {
            orderId: "o9",
            orderNumber: "ORD-9",
          }),
        ).toBe("/profile/orders/o9");
      });

      /** Fallback yalnız bu tipe özeldir; genel bir kaçış değil. */
      it("fallback'i olmayan tip eksik alanda linksiz kalır", () => {
        expect(
          resolveWebNotificationLink(NotificationType.ORDER_SHIPPED, {}),
        ).toBeNull();
      });
    });
  });

  describe("EventService tipleri", () => {
    /**
     * Regresyon: bu tipler enum dışındaydı, push worker `as NotificationType`
     * ile cast ediyordu ve resolver null dönüp bildirim LİNKSİZ kaydediliyordu.
     */
    it.each([
      NotificationType.TRADE_READY_FOR_SHIPPING,
      NotificationType.TRADE_WAREHOUSE_APPROVED,
      NotificationType.TRADE_WAREHOUSE_REJECTED,
      NotificationType.TRADE_CANCEL_LOCKED,
      NotificationType.TRADE_RETURN_COMPLETED,
      NotificationType.TRADE_RETURN_LOST,
      NotificationType.TRADE_REFUND_FAILED,
      NotificationType.TRADE_REFUND_COMPLETED,
    ])("%s → takas detayı", (type) => {
      expect(resolveWebNotificationLink(type, { tradeId: "t1" })).toBe(
        "/profile/trades/t1",
      );
    });

    it("payment_failed alıcının siparişine gider", () => {
      expect(
        resolveWebNotificationLink(NotificationType.PAYMENT_FAILED, {
          orderId: "o1",
        }),
      ).toBe("/profile/orders/o1");
    });

    it("bilinmeyen tip kalıcı yazılamaz (tip kapısı)", () => {
      expect(isKnownNotificationType("uydurma_tip")).toBe(false);
      expect(isKnownNotificationType(NotificationType.ORDER_PAID)).toBe(true);
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

    /**
     * Regresyon: bu üç tip YALNIZ admin'lere gidiyordu ama tüketici sitesinin
     * `/profile/...` yollarına link veriyordu — admin, tıklayınca kendi
     * panelinde olmayan bir ekrana düşüyordu. Hedef artık üreticinin verdiği
     * admin paneli adresidir (diğer admin alarmlarıyla aynı serbest-link kalıbı).
     */
    describe("admin alarmları admin paneline gider", () => {
      const ADMIN_ALARMS = [
        NotificationType.ORDER_STUCK_IN_TRANSIT,
        NotificationType.TRADE_STUCK_AT_WAREHOUSE,
        NotificationType.TRADE_OUTBOUND_DELIVERY_MISSING,
      ];

      it.each(ADMIN_ALARMS)("%s — adminLink zorunlu serbest link", (type) => {
        expect(requiredFieldsFor(type)).toEqual(["adminLink"]);
        expect(
          resolveWebNotificationLink(type, {
            adminLink: "https://admin.tarodan.com.tr/operations/trades/t1",
          }),
        ).toBe("https://admin.tarodan.com.tr/operations/trades/t1");
      });

      it.each(ADMIN_ALARMS)("%s — güvensiz adminLink kaydedilmez", (type) => {
        expect(
          resolveWebNotificationLink(type, {
            adminLink: "javascript:alert(1)",
          }),
        ).toBeNull();
      });
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
      expect(
        resolveWebNotificationLink(
          NotificationType.REFUND_REQUEST_RECEIVED_SELLER,
          { orderId: "o1" },
        ),
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
      expect(
        resolveWebNotificationLink(
          NotificationType.REFUND_REVIEW_REQUIRED_ADMIN,
          {
            adminLink:
              "https://admin.tarodan.com.tr/operations/refund-requests/r1",
          },
        ),
      ).toBe("https://admin.tarodan.com.tr/operations/refund-requests/r1");
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

  describe("iç link güvenliği", () => {
    /**
     * Regresyon: `/` ile başlayan her şey güvenli sayılıyordu. Tarayıcı
     * `/\evil.example/x` adresini `https://evil.example/x` olarak çözüyor —
     * ters bölü ile site DIŞINA çıkılabiliyordu. Ayrıca olmayan bir yol da
     * kabul edildiği için yönetici bildirimi 404 üretebiliyordu.
     */
    it.each([
      ["ters bölü ile origin kaçışı", "/\\evil.example/x"],
      ["kontrol karakteri", "/profile/orders/\u0000x"],
      ["izinli olmayan yol", "/olmayan-bir-sayfa"],
      ["protokol-göreli", "//evil.example.com"],
      // Bu bölümlerin `[id]` route'u YOK: alt segment kabul edilirse
      // tıklayan kullanıcı 404 görür.
      ["olmayan alt sayfa: offers", "/profile/offers/x"],
      ["olmayan alt sayfa: messages", "/profile/messages/x"],
      ["olmayan alt sayfa: payments", "/profile/payments/x"],
      ["olmayan alt sayfa: notifications", "/profile/notifications/x"],
      ["olmayan alt sayfa: favorites", "/profile/favorites/x"],
      ["olmayan alt sayfa: listings", "/profile/listings/x"],
      ["iki kademe derin", "/profile/orders/o1/detay"],
    ])("reddedilir: %s", (_name, link) => {
      expect(isSafeFreeLink(link)).toBe(false);
    });

    /** Dinamik alt segment YALNIZ gerçekten `[id]` route'u olan bölümlerde. */
    it.each(["/profile/orders/o1", "/profile/trades/t1"])(
      "dinamik alt segment kabul edilir: %s",
      (link) => {
        expect(isSafeFreeLink(link)).toBe(true);
      },
    );

    it.each([
      "/profile/offers",
      "/profile/messages",
      "/profile/payments",
      "/profile/notifications",
      "/profile/favorites",
      "/profile/listings",
    ])("liste ekranı kabul edilir: %s", (link) => {
      expect(isSafeFreeLink(link)).toBe(true);
    });

    it.each([
      "/",
      "/listings",
      "/listings/p1",
      "/profile/orders/o1",
      "/seller/orders/o1",
      "/collections/c1",
      "/products/unavailable/p1",
      "https://tarodan.com.tr/kampanya",
    ])("kabul edilir: %s", (link) => {
      expect(isSafeFreeLink(link)).toBe(true);
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

    /**
     * Regresyon: yeniden yazma kuralına uymayan her `/` yolu olduğu gibi
     * dönüyordu. Eski satır sitede karşılığı olmayan ya da ters bölü ile
     * origin'den kaçan bir adres taşıyorsa kullanıcı 404'e veya site dışına
     * gidiyordu — okuma yolu serbest link ile aynı kapıdan geçmeliydi.
     */
    it.each([
      ["sitede karşılığı yok", "/olmayan-bir-sayfa"],
      ["profil altında olmayan sekme", "/profile/gizli-sekme"],
      ["ters bölü ile origin kaçışı", "/\\evil.example/x"],
      ["yeniden yazılıp da geçersiz kalan", "/orders/o1/gizli/derin"],
    ])("eski link doğrulamadan geçmez: %s", (_name, legacy) => {
      expect(normalizeLegacyNotificationLink(legacy)).toBeNull();
    });
  });
});
