import { ProductStatus } from '@prisma/client';
import { buildProductWhere } from './build-product-where';

/**
 * "Stoğu biten ilanlar da listelensin" davranışının regresyon kilidi.
 * Görünürlüğü artık status belirler:
 *  - status verilmezse (genel gözatma): aktif + tükenen (inactive+qty0) + satıldı.
 *  - status verilirse: tam o statü (örn. 'active' → yalnızca stok-içi).
 */
describe('buildProductWhere – stok/görünürlük filtresi', () => {
  it('status verilmediğinde aktif + tükenen(inactive&qty0) + satıldı kümesini döndürür', () => {
    const where = buildProductWhere({});
    const and = (where.AND ?? []) as any[];

    const visibilityOr = and.find((c) => Array.isArray(c.OR))?.OR;
    expect(visibilityOr).toEqual(
      expect.arrayContaining([
        { status: ProductStatus.active },
        { AND: [{ status: ProductStatus.inactive }, { quantity: 0 }] },
        { status: ProductStatus.sold },
      ]),
    );
    // Tek statüye sabitlenmemeli (kapsayıcı mod)
    expect(where.status).toBeUndefined();
  });

  it('status=active verildiğinde yalnızca aktif + stok-içi (qty>0 veya null) döndürür', () => {
    const where = buildProductWhere({ status: ProductStatus.active });
    const and = (where.AND ?? []) as any[];

    expect(where.status).toBe(ProductStatus.active);
    // Stok-içi koşulu korunur
    expect(and).toEqual(
      expect.arrayContaining([
        { OR: [{ quantity: { gt: 0 } }, { quantity: null }] },
      ]),
    );
    // Kapsayıcı OR (tükenen/satıldı) uygulanmamalı
    const hasInclusiveOr = and.some(
      (c: any) =>
        Array.isArray(c.OR) &&
        c.OR.some((x: any) => x.status === ProductStatus.sold),
    );
    expect(hasInclusiveOr).toBe(false);
  });

  it('sanal ürünleri (membership-/boost-) her durumda hariç tutar', () => {
    const where = buildProductWhere({});
    expect(where.NOT).toEqual([
      { id: { startsWith: 'membership-' } },
      { id: { startsWith: 'boost-' } },
    ]);
  });

  it('açık statü verilse de membership/boost istisnaları korunur', () => {
    const where = buildProductWhere({ status: ProductStatus.active });
    expect(where.NOT).toEqual([
      { id: { startsWith: 'membership-' } },
      { id: { startsWith: 'boost-' } },
    ]);
  });
});
