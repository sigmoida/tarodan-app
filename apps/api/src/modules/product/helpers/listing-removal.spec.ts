import {
  ListingRemovalReason,
  ProductInactiveReason,
  ProductStatus,
} from "@prisma/client";
import {
  LISTING_REMOVAL_REASONS,
  replacesCurrentRemovalReason,
} from "@tarodan/types";
import {
  currentReasonGuard,
  isListingRemovalTransition,
  recordListingRemovals,
  stockStatusRemovalReason,
  type ListingRemovalEntry,
} from "./listing-removal";

/**
 * Kaldırma nedenini kaydetmenin TEK yolu. Her kaldırma ekleme-yalnız bir olay
 * satırı (+ kayıt anında `fromStorefront`) ve ilanın güncel nedenini
 * (Product.removalReason) yazar; kaldırma olmayan geçişler hiçbir şey yazmaz.
 */
describe("recordListingRemovals", () => {
  const makeDb = () => ({
    productRemovalEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  });

  it("vitrinden düşüşü olay olarak kaydeder ve ilanın güncel nedenini damgalar", async () => {
    const db = makeDb();

    const count = await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.deleted,
        reason: ListingRemovalReason.sold_elsewhere,
        platform: "dolap",
        detail: "Dolap'ta sattım",
        actorUserId: "seller-1",
      },
    ]);

    expect(count).toBe(1);
    expect(db.productRemovalEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: "p1",
          reason: ListingRemovalReason.sold_elsewhere,
          platform: "dolap",
          violationCode: null,
          detail: "Dolap'ta sattım",
          statusBefore: ProductStatus.active,
          statusAfter: ProductStatus.deleted,
          fromStorefront: true,
          actorUserId: "seller-1",
        },
      ],
    });
    // Güncel neden yalnız ilan hâlâ yeni statüdeyse yazılır; vitrinden düşüş
    // koşulsuz günceller.
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["p1"] }, status: ProductStatus.deleted },
      data: { removalReason: ListingRemovalReason.sold_elsewhere },
    });
  });

  it("eksik opsiyonel alanlar null yazılır (sistem kaldırması: aktörsüz)", async () => {
    const db = makeDb();

    await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.inactive,
        reason: ListingRemovalReason.expired,
      },
    ]);

    expect(db.productRemovalEvent.createMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({
        platform: null,
        violationCode: null,
        detail: null,
        actorUserId: null,
      }),
    );
  });

  it.each([
    ["vitrine dönüş (active)", ProductStatus.inactive, ProductStatus.active],
    ["satış (sold)", ProductStatus.reserved, ProductStatus.sold],
    [
      "aynı statünün yeniden yazımı",
      ProductStatus.inactive,
      ProductStatus.inactive,
    ],
  ])(
    "kaldırma olmayan geçişte (%s) hiçbir şey yazmaz",
    async (_l, from, to) => {
      const db = makeDb();

      const count = await recordListingRemovals(db as any, [
        {
          productId: "p1",
          statusBefore: from,
          statusAfter: to,
          reason: ListingRemovalReason.out_of_stock,
        },
      ]);

      expect(count).toBe(0);
      expect(db.productRemovalEvent.createMany).not.toHaveBeenCalled();
      expect(db.product.updateMany).not.toHaveBeenCalled();
    },
  );

  it("toplu kaldırmada (neden, statü, vitrinden mi) başına tek damga yazımı yapar", async () => {
    const db = makeDb();

    const count = await recordListingRemovals(db as any, [
      {
        productId: "a",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.suspended,
        reason: ListingRemovalReason.seller_suspended,
      },
      {
        productId: "b",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.suspended,
        reason: ListingRemovalReason.seller_suspended,
      },
      {
        productId: "c",
        statusBefore: ProductStatus.pending,
        statusAfter: ProductStatus.rejected,
        reason: ListingRemovalReason.seller_suspended,
      },
    ]);

    expect(count).toBe(3);
    expect(db.productRemovalEvent.createMany).toHaveBeenCalledTimes(1);
    expect(
      db.productRemovalEvent.createMany.mock.calls[0][0].data.map(
        (row: { productId: string; fromStorefront: boolean }) => [
          row.productId,
          row.fromStorefront,
        ],
      ),
    ).toEqual([
      ["a", true],
      ["b", true],
      // Onay bekleyen ilan vitrinde değildi: kaydedilir, sayılmaz.
      ["c", false],
    ]);
    expect(db.product.updateMany).toHaveBeenCalledTimes(2);
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] }, status: ProductStatus.suspended },
      data: { removalReason: ListingRemovalReason.seller_suspended },
    });
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c"] }, status: ProductStatus.rejected },
      data: { removalReason: ListingRemovalReason.seller_suspended },
    });
  });

  it("boş liste no-op'tur", async () => {
    const db = makeDb();
    expect(await recordListingRemovals(db as any, [])).toBe(0);
    expect(db.productRemovalEvent.createMany).not.toHaveBeenCalled();
  });

  /**
   * Olaylar ekleme-yalnızdır: ilan vitrinden düşer, yeniden açılır, tekrar
   * düşerse İKİ olay vardır (dashboard ikisini de kendi anında sayar).
   * Aradaki yeniden açılış bir kaldırma değildir, kayıt üretmez.
   */
  it("kaldır → yeniden aç → tekrar kaldır: iki olay", async () => {
    const db = makeDb();
    const events: unknown[] = [];
    db.productRemovalEvent.createMany.mockImplementation(
      async ({ data }: { data: unknown[] }) => {
        events.push(...data);
        return { count: data.length };
      },
    );

    await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.inactive,
        reason: ListingRemovalReason.paused_temporarily,
        actorUserId: "seller-1",
      },
    ]);
    // Satıcı yeniden açar (inactive → pending): kaldırma değil.
    await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.inactive,
        statusAfter: ProductStatus.pending,
        reason: ListingRemovalReason.paused_temporarily,
      },
    ]);
    await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.deleted,
        reason: ListingRemovalReason.sold_elsewhere,
        platform: "letgo",
        actorUserId: "seller-1",
      },
    ]);

    expect(events).toHaveLength(2);
    expect(events).toEqual([
      expect.objectContaining({
        reason: ListingRemovalReason.paused_temporarily,
        statusAfter: ProductStatus.inactive,
        fromStorefront: true,
      }),
      expect.objectContaining({
        reason: ListingRemovalReason.sold_elsewhere,
        platform: "letgo",
        statusAfter: ProductStatus.deleted,
        fromStorefront: true,
      }),
    ]);
  });
});

/**
 * Sayım kuralı ve güncel neden önceliği, gerçek `where` anlamını uygulayan
 * bellek-içi bir ilan tablosuyla: yalnız vitrinden düşüş sayılır; vitrin
 * dışındaki ilanda satıcının sonraki eylemi kaydedilir ama yönetici/sistem
 * nedenini ezmez.
 */
describe("recordListingRemovals — sayım kuralı ve güncel neden", () => {
  type Row = {
    status: ProductStatus;
    removalReason: ListingRemovalReason | null;
  };

  const matches = (row: Row, where: Record<string, any>): boolean => {
    if (where.status && row.status !== where.status) return false;
    if (!where.OR) return true;
    return where.OR.some((cond: Record<string, any>) =>
      cond.removalReason === null
        ? row.removalReason === null
        : (cond.removalReason.in as string[]).includes(
            row.removalReason as string,
          ),
    );
  };

  /** Ürün satırları + kaydedilen olaylar; `apply` statü yazımını taklit eder. */
  const makeTable = (initial: Row) => {
    const row: Row = { ...initial };
    const events: Array<Record<string, unknown>> = [];
    const db = {
      productRemovalEvent: {
        createMany: jest.fn(async ({ data }: { data: any[] }) => {
          events.push(...data);
          return { count: data.length };
        }),
        // Geçmiş sorgusu: sold_elsewhere ya da vitrinden düşüş olayları, en yenisi önce.
        findMany: jest.fn(async () =>
          events
            .filter((e) => e.reason === "sold_elsewhere" || e.fromStorefront)
            .map((e) => ({ reason: e.reason, fromStorefront: e.fromStorefront }))
            .reverse(),
        ),
      },
      product: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (!matches(row, where)) return { count: 0 };
          row.removalReason = data.removalReason;
          return { count: 1 };
        }),
      },
    };
    const remove = async (
      entry: Omit<ListingRemovalEntry, "productId" | "statusBefore">,
    ) => {
      const statusBefore = row.status;
      row.status = entry.statusAfter; // çağıranın statü yazımı
      await recordListingRemovals(db as any, [
        { productId: "p1", statusBefore, ...entry },
      ]);
    };
    const counted = () => events.filter((e) => e.fromStorefront).length;
    /** Platform kırılımına girenler: vitrinden düşüş + geç gelen cevap. */
    const platformCounted = () =>
      events.filter(
        (e) =>
          e.reason === "sold_elsewhere" &&
          (e.fromStorefront || e.lateSoldElsewhere),
      ).length;
    return { row, events, remove, counted, platformCounted };
  };

  it("yönetici reddi → satıcı pasife alır: tek sayılan olay, neden 'kural ihlali' kalır", async () => {
    const t = makeTable({ status: ProductStatus.active, removalReason: null });

    await t.remove({
      statusAfter: ProductStatus.rejected,
      reason: ListingRemovalReason.policy_violation,
      violationCode: "counterfeit_replica",
    });
    await t.remove({
      statusAfter: ProductStatus.inactive,
      reason: ListingRemovalReason.paused_temporarily,
    });

    expect(t.events).toHaveLength(2); // geçmiş ikisini de gösterir
    expect(t.counted()).toBe(1);
    expect(t.row.removalReason).toBe(ListingRemovalReason.policy_violation);
  });

  /**
   * Rezerve ilan vitrinde gizlidir ama yayındaki ilanın geçici tutuluşudur:
   * tutuluşa girmek ve vitrine dönmek kayıt üretmez, satış kaldırma değildir;
   * tutuluştan kalıcı düşüş ilanın TEK çıkışıdır ve bir kez sayılır.
   */
  describe("rezerve (geçici tutuluş)", () => {
    it("takas tamamlanınca stoğu biten rezerve ilan (reserved → inactive) bir kez sayılır", async () => {
      const t = makeTable({
        status: ProductStatus.active,
        removalReason: null,
      });

      // Takas kabulü: active → reserved — kaldırma değil, kayıt yok.
      await t.remove({
        statusAfter: ProductStatus.reserved,
        reason: ListingRemovalReason.traded,
      });
      expect(t.events).toHaveLength(0);

      await t.remove({
        statusAfter: ProductStatus.inactive,
        reason: ListingRemovalReason.traded,
      });

      expect(t.events).toEqual([
        expect.objectContaining({
          reason: ListingRemovalReason.traded,
          statusBefore: ProductStatus.reserved,
          statusAfter: ProductStatus.inactive,
          fromStorefront: true,
        }),
      ]);
      expect(t.counted()).toBe(1);
      expect(t.row.removalReason).toBe(ListingRemovalReason.traded);
    });

    it("rezervasyon bırakılıp stok yoksa (reserved → inactive) bir kez sayılır", async () => {
      const t = makeTable({
        status: ProductStatus.reserved,
        removalReason: null,
      });

      await t.remove({
        statusAfter: ProductStatus.inactive,
        reason: ListingRemovalReason.out_of_stock,
      });

      expect(t.counted()).toBe(1);
    });

    it("reserved → active → inactive bir kez sayılır (vitrine dönüş kayıt üretmez)", async () => {
      const t = makeTable({
        status: ProductStatus.reserved,
        removalReason: null,
      });

      await t.remove({
        statusAfter: ProductStatus.active,
        reason: ListingRemovalReason.out_of_stock,
      });
      await t.remove({
        statusAfter: ProductStatus.inactive,
        reason: ListingRemovalReason.paused_temporarily,
      });

      expect(t.events).toEqual([
        expect.objectContaining({
          statusBefore: ProductStatus.active,
          statusAfter: ProductStatus.inactive,
          fromStorefront: true,
        }),
      ]);
      expect(t.counted()).toBe(1);
    });

    it("reserved → sold kaldırma değildir: kayıt yok", async () => {
      const t = makeTable({
        status: ProductStatus.reserved,
        removalReason: null,
      });

      await t.remove({
        statusAfter: ProductStatus.sold,
        reason: ListingRemovalReason.out_of_stock,
      });

      expect(t.events).toHaveLength(0);
    });

    it.each([
      [
        "yönetici reddi",
        ProductStatus.rejected,
        ListingRemovalReason.policy_violation,
      ],
      [
        "satıcının askıya alınması",
        ProductStatus.suspended,
        ListingRemovalReason.seller_suspended,
      ],
    ])(
      "rezerve ilanın %s ile kaldırılması bir kez sayılır",
      async (_label, statusAfter, reason) => {
        const t = makeTable({
          status: ProductStatus.reserved,
          removalReason: null,
        });

        await t.remove({ statusAfter, reason });

        expect(t.events).toEqual([
          expect.objectContaining({ reason, fromStorefront: true }),
        ]);
        expect(t.counted()).toBe(1);
        expect(t.row.removalReason).toBe(reason);
      },
    );
  });

  it("onay bekleyen ilanın askıya almayla reddi kaydedilir ama sayılmaz", async () => {
    const t = makeTable({ status: ProductStatus.pending, removalReason: null });

    await t.remove({
      statusAfter: ProductStatus.rejected,
      reason: ListingRemovalReason.seller_suspended,
    });

    expect(t.events).toEqual([
      expect.objectContaining({
        reason: ListingRemovalReason.seller_suspended,
        fromStorefront: false,
      }),
    ]);
    expect(t.counted()).toBe(0);
    expect(t.row.removalReason).toBe(ListingRemovalReason.seller_suspended);
  });

  it("süre dolumu → satıcı siler: ikinci olay sayılmaz, neden 'süresi doldu' kalır", async () => {
    const t = makeTable({ status: ProductStatus.active, removalReason: null });

    await t.remove({
      statusAfter: ProductStatus.inactive,
      reason: ListingRemovalReason.expired,
    });
    await t.remove({
      statusAfter: ProductStatus.deleted,
      reason: ListingRemovalReason.sold_elsewhere,
      platform: "dolap",
    });

    expect(t.events).toHaveLength(2);
    expect(t.counted()).toBe(1);
    expect(t.row.removalReason).toBe(ListingRemovalReason.expired);
    // Toplamda süre dolumu bir kez; platform kırılımında geç gelen cevap bir kez.
    expect(t.events[1]).toEqual(
      expect.objectContaining({
        fromStorefront: false,
        lateSoldElsewhere: true,
      }),
    );
    expect(t.platformCounted()).toBe(1);
  });

  it("vitrinden 'başka platformda sattım' ile düşen ilanın sonraki silmesi platforma ikinci kez girmez", async () => {
    const t = makeTable({ status: ProductStatus.active, removalReason: null });

    await t.remove({
      statusAfter: ProductStatus.inactive,
      reason: ListingRemovalReason.sold_elsewhere,
      platform: "dolap",
    });
    await t.remove({
      statusAfter: ProductStatus.deleted,
      reason: ListingRemovalReason.sold_elsewhere,
      platform: "dolap",
    });

    expect(t.counted()).toBe(1);
    expect(t.events[1]).not.toHaveProperty("lateSoldElsewhere");
    expect(t.platformCounted()).toBe(1);
  });

  it("vitrin dışı zincirde (reddedilmiş) iki satıcı cevabından yalnız ilki platforma girer", async () => {
    const t = makeTable({ status: ProductStatus.rejected, removalReason: null });

    await t.remove({
      statusAfter: ProductStatus.inactive,
      reason: ListingRemovalReason.sold_elsewhere,
      platform: "letgo",
    });
    await t.remove({
      statusAfter: ProductStatus.deleted,
      reason: ListingRemovalReason.sold_elsewhere,
      platform: "letgo",
    });

    expect(t.counted()).toBe(0);
    expect(t.platformCounted()).toBe(1);
  });

  it("yeniden yayına girip tekrar düşen ilanda yeni düşüş zinciri başlar: ikinci geç cevap yeniden sayılır", async () => {
    const t = makeTable({ status: ProductStatus.active, removalReason: null });

    await t.remove({
      statusAfter: ProductStatus.inactive,
      reason: ListingRemovalReason.sold_elsewhere,
      platform: "dolap",
    });
    t.row.status = ProductStatus.active; // yeniden yayın
    await t.remove({
      statusAfter: ProductStatus.inactive,
      reason: ListingRemovalReason.expired,
    });
    await t.remove({
      statusAfter: ProductStatus.deleted,
      reason: ListingRemovalReason.sold_elsewhere,
      platform: "instagram",
    });

    expect(t.counted()).toBe(2);
    expect(t.platformCounted()).toBe(2);
  });

  it("sold_elsewhere olmayan vitrin dışı kayıt geç bayrak almaz ve geçmişi okumaz", async () => {
    const t = makeTable({ status: ProductStatus.pending, removalReason: null });

    await t.remove({
      statusAfter: ProductStatus.rejected,
      reason: ListingRemovalReason.seller_suspended,
    });

    expect(t.events[0]).not.toHaveProperty("lateSoldElsewhere");
    expect(t.platformCounted()).toBe(0);
  });

  it("satıcının duraklattığı ilanı satıcı silerse güncel neden satıcının son nedenine geçer", async () => {
    const t = makeTable({ status: ProductStatus.active, removalReason: null });

    await t.remove({
      statusAfter: ProductStatus.inactive,
      reason: ListingRemovalReason.paused_temporarily,
    });
    await t.remove({
      statusAfter: ProductStatus.deleted,
      reason: ListingRemovalReason.sold_elsewhere,
      platform: "letgo",
    });

    expect(t.counted()).toBe(1);
    expect(t.row.removalReason).toBe(ListingRemovalReason.sold_elsewhere);
  });

  it.each([
    ["satıcının duraklattığı", ListingRemovalReason.paused_temporarily, null],
    [
      "süresi dolmuş",
      ListingRemovalReason.expired,
      ProductInactiveReason.expired,
    ],
  ])(
    "%s pasif ilan iade karantinasına girince kayıt düşülür, güncel neden onu izler, sayılmaz",
    async (_label, currentReason, inactiveReasonBefore) => {
      const t = makeTable({
        status: ProductStatus.inactive,
        removalReason: currentReason,
      });

      // Statü değişmez (inactive → inactive), davranış işareti değişir.
      await t.remove({
        statusAfter: ProductStatus.inactive,
        inactiveReasonBefore,
        inactiveReasonAfter: ProductInactiveReason.return_quarantine,
        reason: ListingRemovalReason.return_quarantine,
      });

      expect(t.events).toEqual([
        expect.objectContaining({
          reason: ListingRemovalReason.return_quarantine,
          statusBefore: ProductStatus.inactive,
          statusAfter: ProductStatus.inactive,
          fromStorefront: false,
        }),
      ]);
      expect(t.counted()).toBe(0);
      expect(t.row.removalReason).toBe(ListingRemovalReason.return_quarantine);
    },
  );

  it("karantinadaki ilana ikinci karantina (işaret değişmedi) kayıt üretmez", async () => {
    const t = makeTable({
      status: ProductStatus.inactive,
      removalReason: ListingRemovalReason.return_quarantine,
    });

    await t.remove({
      statusAfter: ProductStatus.inactive,
      inactiveReasonBefore: ProductInactiveReason.return_quarantine,
      inactiveReasonAfter: ProductInactiveReason.return_quarantine,
      reason: ListingRemovalReason.return_quarantine,
    });

    expect(t.events).toHaveLength(0);
  });
});

describe("currentReasonGuard ↔ replacesCurrentRemovalReason", () => {
  /** Koşulun küme biçimi tek-satır kuralıyla aynı kararı verir. */
  const guardAllows = (
    guard: ReturnType<typeof currentReasonGuard>,
    current: ListingRemovalReason | null,
  ): boolean => {
    if (!guard.OR) return true;
    return (guard.OR as Array<Record<string, any>>).some((cond) =>
      cond.removalReason === null
        ? current === null
        : current !== null &&
          (cond.removalReason.in as string[]).includes(current),
    );
  };

  it("her (vitrinden mi, yeni neden, güncel neden) üçlüsünde aynı karar", () => {
    // Kopya, öğe tipi Prisma enum'una karşı DENETLENEREK kurulur (cast yok):
    // katalog ile enum aynı kümeyi taşımasa bu satır derlenmez.
    const reasons: ListingRemovalReason[] = [...LISTING_REMOVAL_REASONS];
    const currents: Array<ListingRemovalReason | null> = [null, ...reasons];
    for (const fromStorefront of [true, false]) {
      for (const reason of reasons) {
        const guard = currentReasonGuard({ fromStorefront, reason });
        for (const current of currents) {
          expect([
            fromStorefront,
            reason,
            current,
            guardAllows(guard, current),
          ]).toEqual([
            fromStorefront,
            reason,
            current,
            replacesCurrentRemovalReason({ fromStorefront, reason, current }),
          ]);
        }
      }
    }
  });
});

describe("isListingRemovalTransition", () => {
  it("kaldırma statüsüne geçişte ya da işaret değişiminde true", () => {
    expect(
      isListingRemovalTransition({
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.rejected,
      }),
    ).toBe(true);
    expect(
      isListingRemovalTransition({
        statusBefore: ProductStatus.inactive,
        statusAfter: ProductStatus.deleted,
      }),
    ).toBe(true);
    expect(
      isListingRemovalTransition({
        statusBefore: ProductStatus.deleted,
        statusAfter: ProductStatus.pending,
      }),
    ).toBe(false);
    expect(
      isListingRemovalTransition({
        statusBefore: ProductStatus.inactive,
        statusAfter: ProductStatus.inactive,
        inactiveReasonBefore: null,
        inactiveReasonAfter: ProductInactiveReason.expired,
      }),
    ).toBe(true);
    // İşareti vermeyen çağıran için yalnız statü değişimi bakılır.
    expect(
      isListingRemovalTransition({
        statusBefore: ProductStatus.inactive,
        statusAfter: ProductStatus.inactive,
      }),
    ).toBe(false);
  });
});

describe("stockStatusRemovalReason", () => {
  it("karantina davranış işaretiyle aynı adı taşır, diğer her stok düşüşü 'stok tükendi'", () => {
    expect(
      stockStatusRemovalReason(ProductInactiveReason.return_quarantine),
    ).toBe(ListingRemovalReason.return_quarantine);
    expect(stockStatusRemovalReason(null)).toBe(
      ListingRemovalReason.out_of_stock,
    );
    expect(stockStatusRemovalReason(undefined)).toBe(
      ListingRemovalReason.out_of_stock,
    );
  });
});
