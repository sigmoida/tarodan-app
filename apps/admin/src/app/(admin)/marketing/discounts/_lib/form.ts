import {
  amountInputValue,
  amountOrNull,
  amountOrZero,
} from "@/lib/schemas/amount";
import { userOptionLabel } from "../_hooks/useUserOptions";
import type { DiscountFormValues } from "./schema";
import type { Discount } from "./types";

const isoDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

/**
 * Discount → form defaults (numerics converted to strings). The value and the
 * TL amounts get a decimal comma, as their text fields read it.
 */
export function discountToForm(d?: Discount): DiscountFormValues {
  if (!d) {
    return {
      code: "",
      name: "",
      description: "",
      type: "percentage",
      value: "10",
      scope: "global",
      categoryId: "",
      target: "buyer_commission",
      audience: "everyone",
      targetTierTypes: [],
      targetUserIds: [],
      budgetLimit: "",
      minCartValue: "",
      minQuantity: "",
      buyQuantity: "",
      getQuantity: "",
      maxDiscountAmount: "",
      usageLimitTotal: "",
      usageLimitPerUser: "1",
      isStackable: false,
      isActive: true,
      isFlashSale: false,
      startDate: isoDate(),
      endDate: isoDate(30),
    };
  }
  return {
    code: d.code ?? "",
    name: d.name,
    description: d.description ?? "",
    type: d.type,
    value: amountInputValue(d.value),
    scope: d.scope === "category" ? "category" : "global",
    categoryId: d.categoryId ?? "",
    // Ürün fiyatı kampanyaları satıcıya aittir ve bu formdan düzenlenmez;
    // eski bir kayıt açılırsa varsayılan bedel kalemine düşer.
    target:
      d.target && d.target !== "product_price" ? d.target : "buyer_commission",
    audience: d.audience ?? "everyone",
    targetTierTypes: (d.targetTierTypes ?? []).map((value) => ({
      value,
      label: value,
    })),
    // Sunucu hedeflenen kişileri adlarıyla döndürür; yalnız kimlik geldiğinde
    // (eski yanıt) çip kimliği gösterir — seçim yine de KAYBOLMAZ, ki düzenleme
    // kaydı kitleyi sıfırlamasın.
    targetUserIds: (d.targetUsers?.length
      ? d.targetUsers.map((u) => ({
          value: u.id,
          label: userOptionLabel(u),
        }))
      : (d.targetUserIds ?? []).map((id) => ({
          value: id,
          label: id,
        }))) as Array<{
      value: string;
      label: string;
    }>,
    budgetLimit: amountInputValue(d.budgetLimit),
    minCartValue: amountInputValue(d.minCartValue),
    minQuantity: d.minQuantity?.toString() ?? "",
    buyQuantity: d.buyQuantity?.toString() ?? "",
    getQuantity: d.getQuantity?.toString() ?? "",
    maxDiscountAmount: amountInputValue(d.maxDiscountAmount),
    usageLimitTotal: d.usageLimitTotal?.toString() ?? "",
    // null = limitsiz; formda 0 olarak temsil edilir (API sözleşmesi: 0 = limitsiz).
    usageLimitPerUser: (d.usageLimitPerUser ?? 0).toString(),
    isStackable: d.isStackable,
    isActive: d.isActive,
    isFlashSale: d.isFlashSale,
    startDate: d.startDate.split("T")[0],
    endDate: d.endDate.split("T")[0],
  };
}

/**
 * Convert form values into the backend payload (string→number/ISO). The
 * amounts are read by the shared TL amount parser; blank optional amounts are
 * left out, as before.
 */
export function discountFormToPayload(v: DiscountFormValues) {
  return {
    code: v.code.trim() ? v.code.trim().toUpperCase() : null,
    name: v.name,
    description: v.description || undefined,
    type: v.type,
    value: amountOrZero(v.value),
    scope: v.scope,
    categoryId: v.scope === "category" ? v.categoryId : undefined,
    minCartValue: amountOrNull(v.minCartValue) ?? undefined,
    minQuantity: v.minQuantity ? parseInt(v.minQuantity) : undefined,
    buyQuantity: v.buyQuantity ? parseInt(v.buyQuantity) : undefined,
    getQuantity: v.getQuantity ? parseInt(v.getQuantity) : undefined,
    maxDiscountAmount: amountOrNull(v.maxDiscountAmount) ?? undefined,
    usageLimitTotal: v.usageLimitTotal
      ? parseInt(v.usageLimitTotal)
      : undefined,
    // 0 = kişi-başı limitsiz (yalnız 'herkes' kitlesinde; misafirler ancak
    // limitsiz kodu kullanabilir). Boş bırakılırsa varsayılan 1.
    usageLimitPerUser:
      v.usageLimitPerUser.trim() === ""
        ? 1
        : parseInt(v.usageLimitPerUser) || 0,
    isStackable: v.isStackable,
    priority: 0,
    isActive: v.isActive,
    isFlashSale: v.isFlashSale,
    startDate: new Date(v.startDate).toISOString(),
    endDate: new Date(v.endDate + "T23:59:59").toISOString(),
    target: v.target,
    audience: v.audience,
    targetTierTypes:
      v.audience === "membership_tiers"
        ? v.targetTierTypes.map((option) => option.value)
        : [],
    targetUserIds:
      v.audience === "specific_buyers" || v.audience === "specific_sellers"
        ? v.targetUserIds.map((option) => option.value)
        : [],
    budgetLimit: amountOrNull(v.budgetLimit) ?? undefined,
  };
}
