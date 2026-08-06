import { Injectable } from "@nestjs/common";
import { DiscountScope } from "@prisma/client";
import { PrismaService } from "../../prisma";
import {
  ancestorCategoryIds,
  buildCategoryParentMap,
  loadCategoryEdges,
} from "../category/category-tree.helper";

/**
 * "Bu indirim bu ürünü kapsıyor mu?" sorusunun TEK yetkilisi.
 *
 * Aynı karar üç yerde ayrı yazılmıştı ve üçü de farklı davranıyordu: sepet
 * kategori dalını hiç uygulamıyor (her ürünü uygun sayıyor), kupon servisi
 * birebir kategori eşleşmesi arıyor, ölü hesaplayıcı ise kategori dalında
 * satıcıya bakıyordu. Kapsam hem kampanyanın (vitrin fiyatı) hem kuponun
 * (sepet indirimi) tabanını belirlediği için bu ayrışma doğrudan para farkıydı.
 */

export interface ScopedProduct {
  id: string;
  sellerId: string;
  categoryId: string | null;
}

export interface ScopedDiscount {
  scope: DiscountScope;
  sellerId: string | null;
  categoryId: string | null;
  targetProductIds: string[];
}

/** categoryId → kendisi + tüm üst kategorileri. */
export type CategoryAncestors = Map<string, Set<string>>;

/**
 * Saf kapsam kararı. `ancestors` verilmezse kategori dalı birebir eşleşmeye
 * düşer — çağıranın ağacı yüklemeyi unutması sessiz bir kapsam DARALMASI
 * olur, genişlemesi değil.
 */
export function isProductInDiscountScope(
  product: ScopedProduct,
  discount: ScopedDiscount,
  ancestors?: CategoryAncestors,
): boolean {
  switch (discount.scope) {
    case DiscountScope.global:
      // sellerId dolu bir global indirim yalnız o satıcıyı kapsar.
      return (
        discount.sellerId === null || discount.sellerId === product.sellerId
      );

    case DiscountScope.category: {
      if (!discount.categoryId || !product.categoryId) return false;
      const chain = ancestors?.get(product.categoryId);
      return chain
        ? chain.has(discount.categoryId)
        : product.categoryId === discount.categoryId;
    }

    case DiscountScope.product:
      // Boş hedef listesi = hiçbir ürün (yanlışlıkla "hepsi" olmasın).
      return (
        discount.targetProductIds.length > 0 &&
        discount.targetProductIds.includes(product.id)
      );

    case DiscountScope.seller:
      return (
        discount.sellerId != null && discount.sellerId === product.sellerId
      );

    default:
      return false;
  }
}

@Injectable()
export class DiscountScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ürün kategorilerinin ata zincirleri — üst kategoriye tanımlanmış indirim
   * alt kategorideki ürünü de kapsasın diye.
   *
   * Kategori kapsamlı indirim yoksa ağaç HİÇ yüklenmez: her sepet
   * fiyatlamasına gereksiz bir sorgu eklemez.
   */
  async resolveAncestors(
    discounts: Pick<ScopedDiscount, "scope">[],
    products: Pick<ScopedProduct, "categoryId">[],
  ): Promise<CategoryAncestors> {
    const ancestors: CategoryAncestors = new Map();

    const needsTree = discounts.some(
      (discount) => discount.scope === DiscountScope.category,
    );
    if (!needsTree) return ancestors;

    const categoryIds = [
      ...new Set(products.map((p) => p.categoryId).filter(Boolean)),
    ] as string[];
    if (!categoryIds.length) return ancestors;

    const parentById = buildCategoryParentMap(
      await loadCategoryEdges(this.prisma),
    );
    for (const categoryId of categoryIds) {
      ancestors.set(categoryId, ancestorCategoryIds(parentById, categoryId));
    }
    return ancestors;
  }

  /** Kapsam kararı + ata zinciri — çağıran ikisini ayrı ayrı bilmek zorunda kalmasın. */
  covers(
    product: ScopedProduct,
    discount: ScopedDiscount,
    ancestors?: CategoryAncestors,
  ): boolean {
    return isProductInDiscountScope(product, discount, ancestors);
  }
}
