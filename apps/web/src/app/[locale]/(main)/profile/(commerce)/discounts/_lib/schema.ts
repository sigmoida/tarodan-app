import { z } from "zod";

/**
 * Validation for the discount create/edit form. `z.infer` is structurally the
 * same shape as `DiscountFormData` (value is a number; the money/limit fields
 * stay strings, coerced at the mutation boundary). The refine enforces the one
 * cross-field rule — a product-scoped discount needs at least one product.
 */
export const discountSchema = z
  .object({
    code: z.string(),
    name: z.string().min(1, "İndirim adı gerekli"),
    description: z.string(),
    type: z.enum(["percentage", "fixed_amount", "bogo", "bulk_quantity"]),
    value: z.number().min(0, "Geçerli bir değer girin"),
    buyQuantity: z.string(),
    getQuantity: z.string(),
    minQuantity: z.string(),
    scope: z.enum(["product", "seller"]),
    targetProductIds: z.array(z.string()),
    minCartValue: z.string(),
    maxDiscountAmount: z.string(),
    usageLimitTotal: z.string(),
    usageLimitPerUser: z.string(),
    isStackable: z.boolean(),
    isActive: z.boolean(),
    startDate: z.string().min(1, "Başlangıç tarihi gerekli"),
    endDate: z.string().min(1, "Bitiş tarihi gerekli"),
  })
  .refine((d) => d.scope !== "product" || d.targetProductIds.length > 0, {
    message: "Lütfen en az bir ürün seçin",
    path: ["targetProductIds"],
  })
  .refine((d) => d.type !== "bogo" || parseInt(d.buyQuantity) >= 1, {
    message: "'Al' adedi en az 1 olmalı",
    path: ["buyQuantity"],
  })
  .refine((d) => d.type !== "bogo" || parseInt(d.getQuantity) >= 1, {
    message: "'Bedava' adedi en az 1 olmalı",
    path: ["getQuantity"],
  })
  .refine((d) => d.type !== "bulk_quantity" || parseInt(d.minQuantity) >= 2, {
    message: "En az adet 2 veya üzeri olmalı",
    path: ["minQuantity"],
  })
  .refine(
    (d) => d.type !== "bulk_quantity" || (d.value > 0 && d.value <= 100),
    {
      message: "İndirim yüzdesi 1-100 arası olmalı",
      path: ["value"],
    },
  );

export type DiscountFormValues = z.infer<typeof discountSchema>;
