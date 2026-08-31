import { DiscountResponseDto } from "../dto";

/**
 * Prisma indirim kaydı → API yanıtı. Hem yönetim CRUD'u (DiscountCrudService)
 * hem de vitrin sorgusu (`getProductDiscounts`) aynı gövdeyi döndürmek
 * zorunda; bu yüzden DI'sız tek kaynak burada.
 */
export function toDiscountResponse(discount: any): DiscountResponseDto {
  const now = new Date();
  const isCurrentlyValid =
    discount.isActive &&
    now >= discount.startDate &&
    now <= discount.endDate &&
    (!discount.usageLimitTotal ||
      discount.usedCount < discount.usageLimitTotal);

  return {
    id: discount.id,
    code: discount.code,
    name: discount.name,
    description: discount.description,
    type: discount.type,
    value: Number(discount.value),
    scope: discount.scope,
    sellerId: discount.sellerId,
    sellerName: discount.seller?.displayName,
    categoryId: discount.categoryId,
    categoryName: discount.category?.name,
    targetProductIds: discount.targetProductIds,
    minCartValue: discount.minCartValue
      ? Number(discount.minCartValue)
      : undefined,
    maxDiscountAmount: discount.maxDiscountAmount
      ? Number(discount.maxDiscountAmount)
      : undefined,
    usageLimitTotal: discount.usageLimitTotal,
    usageLimitPerUser: discount.usageLimitPerUser,
    usedCount: discount.usedCount,

    isFlashSale: discount.isFlashSale,
    minQuantity: discount.minQuantity,
    buyQuantity: discount.buyQuantity,
    getQuantity: discount.getQuantity,

    isStackable: discount.isStackable,

    priority: discount.priority,
    isActive: discount.isActive,
    startDate: discount.startDate,
    endDate: discount.endDate,
    createdAt: discount.createdAt,
    updatedAt: discount.updatedAt,
    isCurrentlyValid,
    remainingUsage: discount.usageLimitTotal
      ? discount.usageLimitTotal - discount.usedCount
      : undefined,
    target: discount.target,
    audience: discount.audience,
    targetTierTypes: discount.targetTiers?.map((row: any) => row.tierType),
    targetUserIds: discount.targetUsers?.map((row: any) => row.userId),
    // Kimlik + görünen ad birlikte: düzenleme formu seçili kişileri UUID olarak
    // değil adıyla gösterebilsin. İlişki `user` seçilmeden okunduğunda (bazı
    // okuma yolları yalnız userId alır) alan düşer, çağıran targetUserIds'e
    // geri döner.
    targetUsers: discount.targetUsers
      ?.filter((row: any) => row.user)
      .map((row: any) => ({
        id: row.user.id,
        displayName: row.user.displayName ?? null,
        email: row.user.email ?? null,
      })),
    budgetLimit:
      discount.budgetLimit != null ? Number(discount.budgetLimit) : undefined,
    budgetSpent: Number(discount.budgetSpent ?? 0),
    budgetStoppedAt: discount.budgetStoppedAt ?? undefined,
  };
}
