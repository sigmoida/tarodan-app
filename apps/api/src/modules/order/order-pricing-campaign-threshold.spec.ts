import { DiscountType, ProductKind, ProductStatus } from "@prisma/client";
import { OrderPricingService } from "./order-pricing.service";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";
import { testTaxPolicy } from "./testing/tax-policy-fixture";
import {
  testCampaign,
  testPriceResolver,
} from "../discount/testing/price-resolver-fixture";
import { noCouponDiscountService } from "../discount/testing/discount-service-fixture";

/**
 * Quote ile order-create kampanya eşiğini AYNI tabanla çözmeli.
 *
 * Regresyon: quote ürünleri tek tek fiyatlıyordu, bu da kampanya eşiğini SATIR
 * bazında değerlendirmek demekti; grup order-create ise sepet toplamına
 * bakıyordu. minCartValue'lu bir kampanyada quote indirimi uygulamıyor, create
 * uyguluyordu → birim fiyatlar tutmadığı için pricing hash tutmuyor ve geçerli
 * bir checkout sürekli 409 PRICING_CHANGED ile bloke oluyordu. Komisyon da iki
 * tarafta farklı bir bantla hesaplanabiliyordu.
 */
describe("OrderPricingService.getCheckoutQuote — kampanya eşiği", () => {
  const makeProduct = (id: string, price: number) => ({
    id,
    title: `Ürün ${id}`,
    price,
    oldPrice: null,
    saleStartDate: null,
    saleEndDate: null,
    sellerId: "seller-1",
    categoryId: "category-1",
    shippingDesi: 1,
    kind: ProductKind.listing,
    status: ProductStatus.active,
    seller: {
      businessStatus: null,
      companyName: null,
      taxId: null,
      membership: null,
    },
  });

  const makeService = (products: any[], campaigns: unknown[]) => {
    const prisma = {
      commissionRuleSet: {
        findFirst: jest.fn().mockResolvedValue({ id: "set-1", version: 1 }),
      },
      product: { findMany: jest.fn().mockResolvedValue(products) },
    } as any;
    const service = new OrderPricingService(
      prisma,
      { resolveTaxRate: jest.fn(), calculateTaxAmount: jest.fn() } as any,
      {
        getActiveTariffSnapshot: jest.fn().mockResolvedValue({
          tariffId: "tariff-1",
          tariffVersion: 1,
          tariff: {
            freeShippingEnabled: true,
            freeShippingThreshold: 0,
            packageTiers: flatPackageTiers(0),
          },
        }),
      } as any,
      noCouponDiscountService(),
      testPriceResolver(campaigns),
      testTaxPolicy(),
    );
    jest.spyOn(service, "calculateCommission").mockResolvedValue({
      buyerFeeAmount: 0,
      sellerFeeAmount: 0,
      buyerCommissionAmount: 0,
      buyerServiceFeeAmount: 0,
      sellerCommissionAmount: 0,
      sellerPlatformFeeAmount: 0,
      commissionAmount: 0,
      shippingBuyerShares: { small: 100, medium: 100, large: 100 },
    } as any);
    return service;
  };

  /** minCartValue 100 TL, %10 indirim. */
  const gatedCampaign = [
    testCampaign({
      id: "campaign-1",
      type: DiscountType.percentage,
      value: 10,
      minCartValue: 100,
    }),
  ];

  it("iki 60 TL'lik ürün eşiği BİRLİKTE geçer ve ikisi de indirimli fiyatlanır", async () => {
    const products = [makeProduct("a", 60), makeProduct("b", 60)];
    const quote = await makeService(products, gatedCampaign).getCheckoutQuote(
      {
        items: [
          { productId: "a", quantity: 1 },
          { productId: "b", quantity: 1 },
        ],
      },
      "buyer-1",
    );

    expect(quote.items.map((i) => i.unitPrice)).toEqual([54, 54]);
    expect(quote.itemsSubtotal).toBe(108);
  });

  it("eşik altındaki sepette kampanya uygulanmaz", async () => {
    const products = [makeProduct("a", 60)];
    const quote = await makeService(products, gatedCampaign).getCheckoutQuote(
      { items: [{ productId: "a", quantity: 1 }] },
      "buyer-1",
    );

    expect(quote.items[0].unitPrice).toBe(60);
  });

  it("tek ürün ADETLE eşiği geçerse kampanya uygulanır", async () => {
    const products = [makeProduct("a", 60)];
    const quote = await makeService(products, gatedCampaign).getCheckoutQuote(
      { items: [{ productId: "a", quantity: 2 }] },
      "buyer-1",
    );

    expect(quote.items[0].unitPrice).toBe(54);
    expect(quote.itemsSubtotal).toBe(108);
  });

  it("satın alınamayan satır eşiğe SAYILMAZ", async () => {
    // 60 TL satılabilir + 60 TL pasif ürün: eşik yalnız tahsil edilebilir
    // satırlardan kurulur, aksi halde alıcı hiç ödemediği bir satır sayesinde
    // indirim kazanırdı.
    const products = [
      makeProduct("a", 60),
      { ...makeProduct("b", 60), status: ProductStatus.inactive },
    ];
    const quote = await makeService(products, gatedCampaign).getCheckoutQuote(
      {
        items: [
          { productId: "a", quantity: 1 },
          { productId: "b", quantity: 1 },
        ],
      },
      "buyer-1",
    );

    expect(quote.items).toHaveLength(1);
    expect(quote.items[0].unitPrice).toBe(60);
    expect(quote.unavailableItems.map((i) => i.code)).toEqual([
      "PRODUCT_NOT_ACTIVE",
    ]);
  });

  it("ürünleri TEK sorguda çeker (satır başına sorgu atmaz)", async () => {
    const products = [makeProduct("a", 60), makeProduct("b", 60)];
    const service = makeService(products, gatedCampaign);
    const prisma = (service as any).prisma;

    await service.getCheckoutQuote(
      {
        items: [
          { productId: "a", quantity: 1 },
          { productId: "b", quantity: 1 },
        ],
      },
      "buyer-1",
    );

    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
  });
});
