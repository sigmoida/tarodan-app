import { ProductStatus } from "@prisma/client";
import { resolveUpdatedStatus } from "./product-update-status";
import type { ProductUpdateActor } from "./product-update-actor";

const SELLER: ProductUpdateActor = { kind: "seller", sellerId: "s1" };
const ADMIN: ProductUpdateActor = { kind: "admin", adminId: "a1" };

const product = (
  status: ProductStatus,
  quantity: number | null = 5,
): { status: ProductStatus; quantity: number | null } => ({ status, quantity });

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
