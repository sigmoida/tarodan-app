/** @format */

import { tlAmountInputValue, tlAmountValue } from "@/lib/tlAmount";
import type { Discount, DiscountFormData } from "./types";

/**
 * An optional TL amount field: omitted when the parser reads no amount (empty,
 * "0", "0,00"), so a zero never goes out as a 0 TL cap or threshold. The
 * schema already refused malformed text.
 */
const optionalAmount = (raw: string): number | undefined => {
  const amount = tlAmountValue(raw);
  return amount > 0 ? amount : undefined;
};

/** The create/update request body from the validated form values. */
export function buildPayload(form: DiscountFormData) {
  const isQuantityType = form.type === "bogo" || form.type === "bulk_quantity";
  return {
    // A quantity campaign has no code: the cart applies it automatically.
    code: isQuantityType ? undefined : form.code.trim() || undefined,
    name: form.name,
    description: form.description || undefined,
    type: form.type,
    // bogo has no value; the free quantity comes from buy/get.
    value: form.type === "bogo" ? 0 : tlAmountValue(form.value),
    buyQuantity:
      form.type === "bogo"
        ? parseInt(form.buyQuantity) || undefined
        : undefined,
    getQuantity:
      form.type === "bogo"
        ? parseInt(form.getQuantity) || undefined
        : undefined,
    minQuantity:
      form.type === "bulk_quantity"
        ? parseInt(form.minQuantity) || undefined
        : undefined,
    scope: form.scope,
    targetProductIds: form.scope === "product" ? form.targetProductIds : [],
    minCartValue: optionalAmount(form.minCartValue),
    maxDiscountAmount: optionalAmount(form.maxDiscountAmount),
    usageLimitTotal: form.usageLimitTotal
      ? parseInt(form.usageLimitTotal)
      : undefined,
    usageLimitPerUser: parseInt(form.usageLimitPerUser) || 1,
    isStackable: form.isStackable,
    isActive: form.isActive,
    startDate: new Date(form.startDate).toISOString(),
    endDate: new Date(form.endDate + "T23:59:59").toISOString(),
  };
}

/** The edit form values from a saved discount (the inverse of `buildPayload`). */
export function fromDiscount(d: Discount): DiscountFormData {
  return {
    code: d.code || "",
    name: d.name,
    description: d.description || "",
    type: d.type,
    // Comma decimals, no grouping: the text the amount parser reads back.
    value: tlAmountInputValue(Number(d.value)),
    buyQuantity: d.buyQuantity?.toString() || "",
    getQuantity: d.getQuantity?.toString() || "",
    minQuantity: d.minQuantity?.toString() || "",
    scope: d.scope === "product" ? "product" : "seller",
    targetProductIds: d.targetProductIds || [],
    minCartValue: tlAmountInputValue(Number(d.minCartValue)),
    maxDiscountAmount: tlAmountInputValue(Number(d.maxDiscountAmount)),
    usageLimitTotal: d.usageLimitTotal?.toString() || "",
    usageLimitPerUser: d.usageLimitPerUser.toString(),
    isStackable: d.isStackable,
    isActive: d.isActive,
    startDate: d.startDate.split("T")[0],
    endDate: d.endDate.split("T")[0],
  };
}
