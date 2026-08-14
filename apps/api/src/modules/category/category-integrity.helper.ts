import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CommissionRuleSetStatus, CommissionSellerType } from "@prisma/client";
import { PrismaService } from "../../prisma";

export const CATEGORIES_CACHE_KEY = "categories:all";

export async function assertCategoryHasPublishedCommissionCoverage(
  prisma: PrismaService,
  categoryId: string,
): Promise<void> {
  const activeSet = await prisma.commissionRuleSet.findFirst({
    where: { status: CommissionRuleSetStatus.ACTIVE },
    select: {
      rules: {
        where: { categoryId },
        select: { sellerType: true, minAmount: true, maxAmount: true },
      },
    },
  });
  const sellerTypes = [
    CommissionSellerType.FREE,
    CommissionSellerType.BASIC,
    CommissionSellerType.PREMIUM,
    CommissionSellerType.BUSINESS,
  ];
  const complete =
    !!activeSet &&
    sellerTypes.every((sellerType) => {
      const bands = activeSet.rules
        .filter((rule) => rule.sellerType === sellerType)
        .sort((a, b) => Number(a.minAmount) - Number(b.minAmount));
      if (
        bands.length === 0 ||
        Number(bands[0].minAmount) !== 0 ||
        bands[bands.length - 1].maxAmount != null
      ) {
        return false;
      }
      return bands
        .slice(1)
        .every(
          (band, index) =>
            bands[index].maxAmount != null &&
            Number(bands[index].maxAmount) === Number(band.minAmount),
        );
    });
  if (!complete) {
    throw new BadRequestException(
      "Kategori aktifleştirilemez: aktif komisyon setinde FREE, BASIC, PREMIUM ve BUSINESS için 0 TL'den sonsuza kadar eksiksiz fiyat aralığı yayınlanmalıdır.",
    );
  }
}

export async function assertValidCategoryParent(
  prisma: PrismaService,
  categoryId: string,
  parentId: string,
  requireActiveAncestors: boolean,
): Promise<void> {
  const visited = new Set([categoryId]);
  let currentId: string | null = parentId;

  while (currentId) {
    if (visited.has(currentId)) {
      throw new BadRequestException(
        "Kategori kendi alt kategorisini üst kategori olarak seçemez",
      );
    }
    visited.add(currentId);
    // Annotated to break a circular inference: `currentId` is assigned from
    // `parent.parentId` at the end of the loop, so typing one needs the other.
    const parent: {
      id: string;
      parentId: string | null;
      isActive: boolean;
    } | null = await prisma.category.findUnique({
      where: { id: currentId },
      select: { id: true, parentId: true, isActive: true },
    });
    if (!parent) {
      throw new NotFoundException("Üst kategori bulunamadı");
    }
    if (requireActiveAncestors && !parent.isActive) {
      throw new BadRequestException(
        "Kategori aktifleştirilemez: tüm üst kategoriler aktif olmalıdır.",
      );
    }
    currentId = parent.parentId;
  }
}

export async function assertNoActiveCategoryDescendants(
  prisma: PrismaService,
  categoryId: string,
): Promise<void> {
  const categories = await prisma.category.findMany({
    select: { id: true, parentId: true, isActive: true },
  });
  const descendantIds = new Set([categoryId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const category of categories) {
      if (
        category.parentId &&
        descendantIds.has(category.parentId) &&
        !descendantIds.has(category.id)
      ) {
        descendantIds.add(category.id);
        changed = true;
      }
    }
  }

  if (
    categories.some(
      (category) =>
        category.id !== categoryId &&
        descendantIds.has(category.id) &&
        category.isActive,
    )
  ) {
    throw new BadRequestException(
      "Kategori pasife alınamaz: önce aktif alt kategorileri pasife alınmalıdır.",
    );
  }
}
