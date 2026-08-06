import { allocateProportionally } from "./discount-allocation.helper";

const sum = (values: number[]) =>
  Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;

describe("allocateProportionally", () => {
  it("ağırlık oranında dağıtır", () => {
    expect(allocateProportionally(30, [100, 200])).toEqual([10, 20]);
  });

  it("payların toplamı her zaman dağıtılan tutara eşittir", () => {
    // 10 / 3 kuruşa tam bölünmez; artık son satıra yazılır.
    const shares = allocateProportionally(10, [100, 100, 100]);
    expect(sum(shares)).toBe(10);
    expect(shares).toEqual([3.33, 3.33, 3.34]);
  });

  it("ağırlığı olmayan satır pay almaz ve artık ona düşmez", () => {
    const shares = allocateProportionally(10, [100, 0]);
    expect(shares).toEqual([10, 0]);
    expect(sum(shares)).toBe(10);
  });

  it("son satırın ağırlığı yoksa artık son POZİTİF satıra gider", () => {
    const shares = allocateProportionally(10, [100, 100, 0]);
    expect(shares).toEqual([5, 5, 0]);
    expect(sum(shares)).toBe(10);
  });

  it("dağıtılacak tutar yoksa her satır 0 alır", () => {
    expect(allocateProportionally(0, [100, 200])).toEqual([0, 0]);
  });

  it("ağırlık toplamı 0 ise her satır 0 alır (sıfıra bölme yok)", () => {
    expect(allocateProportionally(50, [0, 0])).toEqual([0, 0]);
  });

  it("satır yoksa boş döner", () => {
    expect(allocateProportionally(50, [])).toEqual([]);
  });

  it("tek satır tutarın tamamını alır", () => {
    expect(allocateProportionally(19.99, [42])).toEqual([19.99]);
  });
});
