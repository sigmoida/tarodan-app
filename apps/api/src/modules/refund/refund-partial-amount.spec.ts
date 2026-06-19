import { Prisma } from '@prisma/client';
import { RefundService } from './refund.service';

/**
 * computePartialRefundAmount, alıcıya iade edilecek tutarı kısmi iade
 * politikasına (4 boolean flag) göre hesaplar.
 *
 * Kritik invariant (gerçek checkout, order.service):
 *   totalAmount = discountedPrice + shippingCost + buyerFeeAmount
 *   subtotal    = originalPrice (indirim ÖNCESİ, alıcının ürüne ödediği DEĞİL)
 *
 * Bu yüzden "ürün tutarı" iadesi stored subtotal'dan değil,
 * alıcının ürüne fiilen ödediği tutardan (totalAmount - shipping - buyerFee)
 * türetilmelidir. Aksi halde:
 *   - subtotal NULL olan siparişlerde ürün tutarı iadeye eklenmez (eksik ödeme)
 *   - indirimli siparişlerde indirim öncesi fiyat iade edilir (fazla ödeme)
 */
describe('RefundService.computePartialRefundAmount', () => {
  // computePartialRefundAmount saf bir fonksiyon; bağımlılıkları kullanmaz.
  const service = new RefundService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const compute = (policy: any, order: any): number =>
    Number((service as any).computePartialRefundAmount(policy, order));

  const D = (n: number) => new Prisma.Decimal(n);

  it('subtotal NULL iken ürün tutarını totalAmount - shipping - buyerFee ile türetir', () => {
    const order = {
      totalAmount: D(249.66),
      subtotal: null,
      shippingCost: D(30),
      buyerFeeAmount: D(0),
    };
    const amount = compute(
      { refundProductAmount: true, refundShippingFee: false, refundBuyerFee: false },
      order,
    );
    expect(amount).toBeCloseTo(219.66, 2);
  });

  it('tüm flagler açıkken alıcının ödediği toplam tutarı iade eder', () => {
    const order = {
      totalAmount: D(249.66),
      subtotal: null,
      shippingCost: D(30),
      buyerFeeAmount: D(0),
    };
    const amount = compute(
      { refundProductAmount: true, refundShippingFee: true, refundBuyerFee: true },
      order,
    );
    expect(amount).toBeCloseTo(249.66, 2);
  });

  it('indirimli siparişte indirim öncesi subtotal yerine ödenen ürün tutarını iade eder', () => {
    // originalPrice=500 (subtotal), kupon -100 => discountedPrice=400
    // totalAmount = 400 + 30 (kargo) + 20 (alıcı komisyonu) = 450
    const order = {
      totalAmount: D(450),
      subtotal: D(500),
      shippingCost: D(30),
      buyerFeeAmount: D(20),
    };
    const amount = compute(
      { refundProductAmount: true, refundShippingFee: false, refundBuyerFee: false },
      order,
    );
    expect(amount).toBeCloseTo(400, 2); // 500 değil!
  });

  it('sadece kargo iadesi yalnızca shippingCost döner', () => {
    const order = {
      totalAmount: D(249.66),
      subtotal: null,
      shippingCost: D(30),
      buyerFeeAmount: D(0),
    };
    const amount = compute(
      { refundProductAmount: false, refundShippingFee: true, refundBuyerFee: false },
      order,
    );
    expect(amount).toBeCloseTo(30, 2);
  });

  it('hiçbir flag açık değilse 0 döner', () => {
    const order = {
      totalAmount: D(249.66),
      subtotal: D(219.66),
      shippingCost: D(30),
      buyerFeeAmount: D(0),
    };
    const amount = compute(
      { refundProductAmount: false, refundShippingFee: false, refundBuyerFee: false },
      order,
    );
    expect(amount).toBe(0);
  });
});
