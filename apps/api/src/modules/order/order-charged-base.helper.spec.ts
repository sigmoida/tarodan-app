import {
  chargedProductBaseOf,
  storedProductBaseOf,
} from "./order-charged-base.helper";
import { buyerTotalOf } from "./order-total.helper";
import { sellerNetAmountOf } from "./order-net.helper";

/**
 * `Order.subtotal` = alıcıdan ÜRÜN için gerçekten tahsil edilen tutar.
 *
 * Eskiden bu kolona indirim ÖNCESİ liste fiyatı yazılıyordu; `unitPrice` ve
 * `totalAmount` ise indirimli tabandan geliyordu. Aynı siparişte üç ayrı fiyat
 * oluşuyor, admin ekranı alıcı toplamını ve satıcı netini indirim kadar yüksek
 * gösteriyordu.
 */
describe("tahsil edilen ürün tabanı", () => {
  it("indirim yoksa birim fiyat × adettir", () => {
    expect(chargedProductBaseOf({ unitPrice: 520.22, quantity: 1 })).toBe(
      520.22,
    );
    expect(chargedProductBaseOf({ unitPrice: 100, quantity: 3 })).toBe(300);
  });

  it("adet verilmezse tek adet sayılır", () => {
    expect(chargedProductBaseOf({ unitPrice: 999 })).toBe(999);
  });

  it("kupon indirimi tabandan düşülür", () => {
    expect(
      chargedProductBaseOf({
        unitPrice: 100,
        quantity: 2,
        couponDiscount: 30,
      }),
    ).toBe(170);
  });

  it("kupon bedeli aşsa bile taban negatife düşmez", () => {
    expect(chargedProductBaseOf({ unitPrice: 100, couponDiscount: 250 })).toBe(
      0,
    );
  });

  it("kayan nokta artığını kuruşa toplar", () => {
    // 0.1 * 3 = 0.30000000000000004 — ham çarpım tabanı kirletiyordu.
    expect(chargedProductBaseOf({ unitPrice: 0.1, quantity: 3 })).toBe(0.3);
  });

  it("geçersiz girdi tabanı bozmaz", () => {
    expect(chargedProductBaseOf({ unitPrice: Number.NaN })).toBe(0);
    expect(chargedProductBaseOf({ unitPrice: 100, quantity: 0 })).toBe(0);
    expect(
      chargedProductBaseOf({ unitPrice: 100, couponDiscount: Number.NaN }),
    ).toBe(100);
  });

  /**
   * Asıl mesele: bu taban, alıcı toplamının ve satıcı netinin TEK dayanağıdır.
   * Ekranda görünen her tutar buradan türemeli — aksi halde kartın üstündeki
   * tahsilat ile alt kırılımdaki "alıcı toplam" ayrışır.
   */
  it("alıcı toplamı ve satıcı neti aynı tabandan türer", () => {
    const base = chargedProductBaseOf({ unitPrice: 520.22, quantity: 1 });
    const fees = {
      buyerShippingAmount: 50,
      buyerFeeAmount: 52.02,
      buyerServiceTaxAmount: 20.4,
    };

    // Alıcının ödediği = taban + alıcıya eklenenler.
    expect(buyerTotalOf({ subtotal: base, ...fees })).toBe(642.64);

    // Satıcının eline geçen = aynı taban − satıcıdan kesilenler.
    expect(
      sellerNetAmountOf({
        subtotal: base,
        productTaxAmount: 0,
        sellerFeeAmount: 52.02,
        withholdingTaxAmount: 0,
        sellerShippingAmount: 50,
        sellerServiceTaxAmount: 20.4,
      }),
    ).toBe(397.8);
  });
});

/**
 * Okuma tarafı: ekranlar "ürün bedeli"ni tek yerden alsın. Eskiden `subtotal`
 * boş olduğunda ham `totalAmount`'a düşülüyordu — o satırda kargo ve komisyon
 * dahil tahsilatın TAMAMI "ürün bedeli" diye görünüyordu.
 */
describe("kayıtlı siparişin ürün tabanı", () => {
  const stored = {
    totalAmount: 642.64,
    buyerShippingAmount: 50,
    shippingCost: 50,
    buyerFeeAmount: 52.02,
    taxAmount: 0,
    buyerServiceTaxAmount: 20.4,
  };

  it("yazılı subtotal varsa odur", () => {
    expect(storedProductBaseOf({ ...stored, subtotal: 520.22 })).toBe(520.22);
  });

  it("Prisma Decimal (string) değeri de çözülür", () => {
    expect(storedProductBaseOf({ ...stored, subtotal: "520.22" })).toBe(520.22);
  });

  it("subtotal yoksa alıcı toplamından geri türetilir", () => {
    expect(storedProductBaseOf(stored)).toBe(520.22);
  });

  it("taraf bölüşümü öncesi kayıtta kargo shipping_cost'tan okunur", () => {
    expect(storedProductBaseOf({ ...stored, buyerShippingAmount: 0 })).toBe(
      520.22,
    );
  });

  it("türetme negatife düşmez", () => {
    expect(storedProductBaseOf({ totalAmount: 10, buyerFeeAmount: 40 })).toBe(
      0,
    );
  });
});
