import { ProductInactiveReason, ProductStatus } from "@prisma/client";
import { resolveUpdatedStatus } from "./product-update-status";
import type { ProductUpdateActor } from "./product-update-actor";

const SELLER: ProductUpdateActor = { kind: "seller", sellerId: "s1" };
const ADMIN: ProductUpdateActor = { kind: "admin", adminId: "a1" };

const product = (
  status: ProductStatus,
  quantity: number | null = 5,
  inactiveReason: ProductInactiveReason | null = null,
): {
  status: ProductStatus;
  quantity: number | null;
  inactiveReason: ProductInactiveReason | null;
} => ({ status, quantity, inactiveReason });

describe("resolveUpdatedStatus — satıcı", () => {
  it("satıcı kendi ilanını pasife alabilir", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.active),
        { status: ProductStatus.inactive } as never,
        SELLER,
      ),
    ).toBe(ProductStatus.inactive);
  });

  it("reddedilen ilan düzenlenince yeniden incelemeye girer", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.rejected),
        { title: "yeni" } as never,
        SELLER,
      ),
    ).toBe(ProductStatus.pending);
  });

  it("satıcı DOĞRUDAN aktifleştiremez — istek onaya gider", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.inactive),
        { status: ProductStatus.active } as never,
        SELLER,
      ),
    ).toBe(ProductStatus.pending);
  });

  /**
   * PO kararı (2026-09-22): teslim SONRASI iade yüzünden sistem tarafından
   * karantinaya alınmış (`return_quarantine`) bir ilanı satıcı DOĞRUDAN
   * aktive edebilir — admin onayı gerekmez. Bu, yukarıdaki genel "satıcı
   * doğrudan aktifleştiremez" kuralının TEK istisnasıdır.
   */
  describe("teslim sonrası iade karantinası (return_quarantine)", () => {
    it("karantinadaki ilanı satıcı DOĞRUDAN aktive edebilir (stok var)", () => {
      expect(
        resolveUpdatedStatus(
          product(
            ProductStatus.inactive,
            3,
            ProductInactiveReason.return_quarantine,
          ),
          { status: ProductStatus.active } as never,
          SELLER,
        ),
      ).toBe(ProductStatus.active);
    });

    it("sınırsız stokta (quantity null) da doğrudan aktive edilir", () => {
      expect(
        resolveUpdatedStatus(
          product(
            ProductStatus.inactive,
            null,
            ProductInactiveReason.return_quarantine,
          ),
          { status: ProductStatus.active } as never,
          SELLER,
        ),
      ).toBe(ProductStatus.active);
    });

    it("stok 0 iken bypass uygulanmaz — genel kurala (pending) düşer", () => {
      expect(
        resolveUpdatedStatus(
          product(
            ProductStatus.inactive,
            0,
            ProductInactiveReason.return_quarantine,
          ),
          { status: ProductStatus.active } as never,
          SELLER,
        ),
      ).toBe(ProductStatus.pending);
    });

    it("aynı istekte gönderilen stok 0'sa da bypass uygulanmaz", () => {
      expect(
        resolveUpdatedStatus(
          product(
            ProductStatus.inactive,
            5,
            ProductInactiveReason.return_quarantine,
          ),
          { status: ProductStatus.active, quantity: 0 } as never,
          SELLER,
        ),
      ).toBe(ProductStatus.pending);
    });

    it("düz pasif (inactiveReason null) hâlâ admin onayına gider — bypass YOK", () => {
      expect(
        resolveUpdatedStatus(
          product(ProductStatus.inactive, 3, null),
          { status: ProductStatus.active } as never,
          SELLER,
        ),
      ).toBe(ProductStatus.pending);
    });
  });

  it("aktif ilanın stoğu biterse pasife düşer", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.active),
        { quantity: 0 } as never,
        SELLER,
      ),
    ).toBe(ProductStatus.inactive);
  });

  it("sıradan düzenleme statüye dokunmaz", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.active),
        { title: "yeni" } as never,
        SELLER,
      ),
    ).toBeUndefined();
  });
});

describe("resolveUpdatedStatus — yönetici", () => {
  /**
   * Yönetici düzeltmesi ilanı YENİDEN ONAYA DÜŞÜRMEZ. Düşseydi, destek ekibinin
   * bir yazım hatasını düzeltmesi ilanı yayından indirir ve yöneticinin kendi
   * düzenlemesini tekrar onaylamasını gerektirirdi.
   */
  it("onaylı ilan düzenlense de onaylı kalır", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.active),
        { title: "duzeltildi", price: 250 } as never,
        ADMIN,
      ),
    ).toBeUndefined();
  });

  it("reddedilen ilanı düzeltmek onu pending'e ÇEKMEZ", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.rejected),
        { title: "duzeltildi" } as never,
        ADMIN,
      ),
    ).toBeUndefined();
  });

  it("statü göndermek bile ilanı değiştirmez", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.pending),
        { status: ProductStatus.active } as never,
        ADMIN,
      ),
    ).toBeUndefined();
  });

  // Tek istisna BÜTÜNLÜK kuralı: stoksuz ilan satışta kalamaz. Bu, yöneticiye
  // verilen bir yetki değil, veriyi tutarlı tutan bir zorunluluk.
  it("stoğu sıfırlanan aktif ilan pasife düşer", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.active),
        { quantity: 0 } as never,
        ADMIN,
      ),
    ).toBe(ProductStatus.inactive);
  });

  it("zaten aktif olmayan ilanda stok sıfırı statüyü oynatmaz", () => {
    expect(
      resolveUpdatedStatus(
        product(ProductStatus.pending),
        { quantity: 0 } as never,
        ADMIN,
      ),
    ).toBeUndefined();
  });
});
