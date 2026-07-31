/**
 * Referans hesaplama tablosu — komisyon/KDV/stopaj formülünün TEK doğrulaması.
 *
 * Bu senaryo işin sahibinin verdiği tablodan birebir alınmıştır. Formülün
 * parçaları dört ayrı dosyada yaşıyor (kural eşleşmesi + ücretler, hizmet KDV'si,
 * stopaj politikası, net hak ediş); her biri kendi başına test edilse de
 * aralarındaki BİRLEŞİM daha önce hiç sabitlenmemişti. Kalemlerden biri
 * değiştiğinde alıcının ödediği ya da satıcının aldığı tutar sessizce kaymasın
 * diye tablonun tamamı burada uçtan uca ölçülür.
 *
 *   Fiyat                              1000
 *   ── Satıcı tarafı (hak edişten düşülür) ──
 *   Satıcı komisyonu        %6          60
 *   Satıcı kargo payı       (tarife)    50
 *   Platform hizmet bedeli  %5          50
 *   Komisyon KDV            %20         12
 *   Kargo KDV               %20         10
 *   Hizmet bedeli KDV       %20         10   → satıcı hizmet KDV'si 32
 *   Stopaj                  %1          10   (YALNIZ kurumsal satıcı)
 *   Satıcı kesinti toplam              202
 *   Satıcı hak ediş                    798
 *   ── Alıcı tarafı (fiyatın üstüne eklenir) ──
 *   Alıcı komisyonu         %4          40
 *   Alıcı kargo payı        (tarife)    50
 *   Alıcı koruma hizmeti    %5          50
 *   Komisyon KDV            %20          8
 *   Kargo KDV               %20         10
 *   Hizmet bedeli KDV       %20         10   → alıcı hizmet KDV'si 28
 *   Alıcıya eklenen                    168
 *   Alıcı ödemesi                     1168
 *
 * Ürün KDV'si tabloda YOKTUR ve sistemde de yoktur: vitrin fiyatı KDV dahil
 * kabul edilir, beyanı satıcıya aittir. Alıcıdan ürün üzerinden KDV alınmaz.
 */
import {
  CommissionAppliesTo,
  CommissionSellerType,
  CommissionTaxpayerType,
} from "@prisma/client";
import {
  calculateCommissionFromRules,
  type CommissionRuleForCalculation,
} from "./order-commission.helper";
import { calculateServiceTax } from "./order-service-tax.helper";
import { sellerNetAmountOf } from "./order-net.helper";
import { OrderTaxPolicyService } from "./order-tax-policy.service";

const PRICE = 1000;
const SERVICE_VAT_RATE = 20;
/** Tek gönderinin bedeli; alıcı ve satıcı %50/%50 paylaşır. */
const SHIPPING_COST = 100;

const REFERENCE_RULE: CommissionRuleForCalculation = {
  id: "reference-rule",
  name: "Referans tablosu",
  categoryId: null,
  sellerType: CommissionSellerType.ALL,
  taxpayerType: CommissionTaxpayerType.all,
  appliesTo: CommissionAppliesTo.BOTH,
  minAmount: null,
  maxAmount: null,
  sellerCommissionRate: 6,
  sellerPlatformFeeRate: 5,
  buyerCommissionRate: 4,
  buyerServiceFeeRate: 5,
  shippingBuyerShare: 50,
};

/** Politikayı gerçek servisle çöz — ayar okuma kuralları da teste dahil olsun. */
function taxPolicyFrom(settings: Record<string, string>) {
  const prisma = {
    platformSetting: {
      findMany: jest.fn().mockResolvedValue(
        Object.entries(settings).map(([settingKey, settingValue]) => ({
          settingKey,
          settingValue,
        })),
      ),
    },
  };
  return new OrderTaxPolicyService(prisma as never);
}

describe("Referans hesaplama tablosu", () => {
  const commission = () =>
    calculateCommissionFromRules(PRICE, [REFERENCE_RULE], {
      categoryId: null,
      sellerType: CommissionSellerType.ALL,
      taxpayerType: CommissionTaxpayerType.all,
      amount: PRICE,
    });

  describe("ücret kalemleri", () => {
    it("dört oranı da ürün fiyatı üzerinden hesaplar (kümülatif değil)", () => {
      const result = commission();

      expect(result.sellerCommissionAmount).toBe(60);
      expect(result.sellerPlatformFeeAmount).toBe(50);
      expect(result.buyerCommissionAmount).toBe(40);
      expect(result.buyerServiceFeeAmount).toBe(50);
    });

    it("kargoyu iki taraf arasında yarı yarıya böler", () => {
      const { shippingBuyerShare } = commission();
      const buyerShipping = (SHIPPING_COST * shippingBuyerShare) / 100;

      expect(buyerShipping).toBe(50);
      expect(SHIPPING_COST - buyerShipping).toBe(50);
    });
  });

  describe("hizmet KDV'si", () => {
    const serviceTax = () => {
      const c = commission();
      const buyerShipping = (SHIPPING_COST * c.shippingBuyerShare) / 100;
      return calculateServiceTax(
        {
          buyerCommissionAmount: c.buyerCommissionAmount,
          buyerServiceFeeAmount: c.buyerServiceFeeAmount,
          buyerShippingAmount: buyerShipping,
          sellerCommissionAmount: c.sellerCommissionAmount,
          sellerPlatformFeeAmount: c.sellerPlatformFeeAmount,
          sellerShippingAmount: SHIPPING_COST - buyerShipping,
        },
        SERVICE_VAT_RATE,
      );
    };

    it("satıcı tarafında 12 + 10 + 10 = 32 üretir", () => {
      expect(serviceTax().sellerServiceTaxAmount).toBe(32);
    });

    it("alıcı tarafında 8 + 10 + 10 = 28 üretir", () => {
      expect(serviceTax().buyerServiceTaxAmount).toBe(28);
    });

    it("ürün bedelini matraha KATMAZ", () => {
      // 1000 matraha girseydi taraf başına en az 200 KDV çıkardı.
      const { buyerServiceTaxAmount, sellerServiceTaxAmount } = serviceTax();
      expect(buyerServiceTaxAmount + sellerServiceTaxAmount).toBe(60);
    });
  });

  describe("stopaj", () => {
    const policySettings = {
      withholding_tax_rate: "1",
      withholding_applies_to_individual: "false",
    };

    it("kurumsal satıcıdan %1 keser", async () => {
      const service = taxPolicyFrom(policySettings);
      const policy = await service.resolve();

      const rate = service.withholdingRateFor(policy, { isCorporate: true });
      expect((PRICE * rate) / 100).toBe(10);
    });

    it("bireysel satıcıdan KESMEZ", async () => {
      const service = taxPolicyFrom(policySettings);
      const policy = await service.resolve();

      expect(service.withholdingRateFor(policy, { isCorporate: false })).toBe(
        0,
      );
    });
  });

  describe("taraf toplamları", () => {
    it("kurumsal satıcının hak edişi 798'dir", () => {
      const c = commission();
      const sellerShipping =
        SHIPPING_COST - (SHIPPING_COST * c.shippingBuyerShare) / 100;

      const net = sellerNetAmountOf({
        subtotal: PRICE,
        productTaxAmount: 0, // vitrin fiyatı KDV dahil
        sellerFeeAmount: c.sellerFeeAmount, // 60 + 50
        withholdingTaxAmount: 10,
        sellerShippingAmount: sellerShipping,
        sellerServiceTaxAmount: 32,
      });

      expect(c.sellerFeeAmount).toBe(110);
      expect(net).toBe(798);
      // Kesinti toplamı tabloyla aynı olmalı.
      expect(PRICE - net).toBe(202);
    });

    it("bireysel satıcı stopaj kesilmediği için 808 alır", () => {
      const c = commission();
      const sellerShipping =
        SHIPPING_COST - (SHIPPING_COST * c.shippingBuyerShare) / 100;

      const net = sellerNetAmountOf({
        subtotal: PRICE,
        productTaxAmount: 0,
        sellerFeeAmount: c.sellerFeeAmount,
        withholdingTaxAmount: 0,
        sellerShippingAmount: sellerShipping,
        sellerServiceTaxAmount: 32,
      });

      expect(net).toBe(808);
    });

    it("alıcı 1168 öder", () => {
      const c = commission();
      const buyerShipping = (SHIPPING_COST * c.shippingBuyerShare) / 100;
      const buyerServiceTax = 28;

      const added = c.buyerFeeAmount + buyerShipping + buyerServiceTax;

      expect(c.buyerFeeAmount).toBe(90); // 40 + 50
      expect(added).toBe(168);
      expect(PRICE + added).toBe(1168);
    });
  });

  describe("TL taban/tavan (min-max)", () => {
    it("ucuz üründe komisyonu tabana çeker", () => {
      const result = calculateCommissionFromRules(
        100,
        [{ ...REFERENCE_RULE, sellerCommissionMin: 10 }],
        {
          categoryId: null,
          sellerType: CommissionSellerType.ALL,
          amount: 100,
        },
      );

      // %6 → 6 TL, taban 10 TL'ye yükseltilir.
      expect(result.sellerCommissionAmount).toBe(10);
    });

    it("pahalı üründe komisyonu tavana kırpar", () => {
      const result = calculateCommissionFromRules(
        20_000,
        [{ ...REFERENCE_RULE, sellerCommissionMax: 500 }],
        {
          categoryId: null,
          sellerType: CommissionSellerType.ALL,
          amount: 20_000,
        },
      );

      // %6 → 1.200 TL, tavan 500 TL'ye indirilir.
      expect(result.sellerCommissionAmount).toBe(500);
    });

    it("taban/tavan boşken saf yüzde uygular", () => {
      expect(commission().sellerCommissionAmount).toBe(60);
    });
  });
});
