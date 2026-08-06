import { allocateProportionally } from "./discount-allocation.helper";

const sumOf = (values: number[]) =>
  Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;

/** Dağıtıcının her çağrıda tutması gereken değişmezler. */
const expectInvariants = (
  shares: number[],
  weights: number[],
  total: number,
) => {
  const weightSum = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  const distributable = Math.min(total, weightSum);

  shares.forEach((share, index) => {
    expect(share).toBeGreaterThanOrEqual(0);
    expect(share).toBeLessThanOrEqual(Math.max(0, weights[index]) + 1e-9);
  });
  expect(sumOf(shares)).toBeCloseTo(Math.round(distributable * 100) / 100, 2);
};

describe("allocateProportionally", () => {
  it("ağırlık oranında dağıtır", () => {
    expect(allocateProportionally(30, [100, 200])).toEqual([10, 20]);
  });

  it("payların toplamı her zaman dağıtılan tutara eşittir", () => {
    const shares = allocateProportionally(10, [100, 100, 100]);
    expect(sumOf(shares)).toBe(10);
    // 10 / 3 kuruşa bölünmez; artan kuruş en büyük kesirli paya gider.
    expect(shares).toEqual([3.34, 3.33, 3.33]);
  });

  describe("negatif pay üretilemez", () => {
    /**
     * Regresyon: her satır ayrı yuvarlanıp artık son satıra yazıldığında,
     * yuvarlanan payların toplamı dağıtılacak tutarı aşınca son satır NEGATİF
     * pay alıyordu → 0.02 TL / 4 eşit satır = [0.01, 0.01, 0.01, -0.01].
     */
    it("kuruş altı pay düşen dört eşit satır", () => {
      const shares = allocateProportionally(0.02, [1, 1, 1, 1]);
      expect(shares).toEqual([0.01, 0.01, 0, 0]);
      expectInvariants(shares, [1, 1, 1, 1], 0.02);
    });

    it("çok küçük indirim, 20 satır", () => {
      const weights = Array.from({ length: 20 }, () => 5);
      const shares = allocateProportionally(0.03, weights);
      expect(shares.filter((s) => s > 0)).toEqual([0.01, 0.01, 0.01]);
      expectInvariants(shares, weights, 0.03);
    });

    it("eşit olmayan ağırlıklarda da negatif çıkmaz", () => {
      const weights = [0.03, 11.5, 0.44, 250, 7];
      const shares = allocateProportionally(0.07, weights);
      expectInvariants(shares, weights, 0.07);
    });
  });

  describe("pay satır tutarını aşamaz", () => {
    /**
     * Regresyon: tek satırlık sepette 50 TL'lik kupon 20 TL'lik satıra 50 TL
     * pay yazıyordu. Teklifle alınan üründe bu, tahsil edilen bedelden büyük
     * bir indirim (ve platform-funded kısımda fazla hakediş) demekti.
     */
    it("dağıtılacak tutar tek satırın tutarını aşarsa satıra kırpılır", () => {
      const shares = allocateProportionally(50, [20]);
      expect(shares).toEqual([20]);
      expectInvariants(shares, [20], 50);
    });

    it("dağıtılacak tutar ağırlık toplamını aşarsa toplama kırpılır", () => {
      const shares = allocateProportionally(500, [30, 20]);
      expect(shares).toEqual([30, 20]);
      expect(sumOf(shares)).toBe(50);
    });
  });

  describe("ağırlıksız satırlar", () => {
    it("ağırlığı olmayan satır pay almaz", () => {
      expect(allocateProportionally(10, [100, 0])).toEqual([10, 0]);
    });

    it("son satırın ağırlığı yoksa artık ona yazılmaz", () => {
      const shares = allocateProportionally(10, [100, 100, 0]);
      expect(shares).toEqual([5, 5, 0]);
      expect(sumOf(shares)).toBe(10);
    });

    it("ağırlık toplamı 0 ise her satır 0 alır (sıfıra bölme yok)", () => {
      expect(allocateProportionally(50, [0, 0])).toEqual([0, 0]);
    });
  });

  it("dağıtılacak tutar yoksa her satır 0 alır", () => {
    expect(allocateProportionally(0, [100, 200])).toEqual([0, 0]);
  });

  it("satır yoksa boş döner", () => {
    expect(allocateProportionally(50, [])).toEqual([]);
  });

  it("tek satır tutarın tamamını alır", () => {
    expect(allocateProportionally(19.99, [42])).toEqual([19.99]);
  });

  it("sonuç girdi sırasına göre deterministiktir", () => {
    const weights = [33.33, 33.33, 33.34];
    const first = allocateProportionally(7.77, weights);
    const second = allocateProportionally(7.77, weights);
    expect(first).toEqual(second);
    expectInvariants(first, weights, 7.77);
  });
});
