import { z } from 'zod';

/**
 * Discount form — validation-only. Numeric fields are kept as strings (native
 * number/date inputs return strings); the string→number/ISO conversion happens
 * in the modal's mutationFn, so the z.infer types stay honest.
 */
export const discountSchema = z
  .object({
    code: z.string(),
    name: z.string().min(1, 'İndirim adı gerekli'),
    description: z.string(),
    type: z.enum(['percentage', 'fixed_amount', 'bogo', 'bulk_quantity']),
    value: z.string().min(1, 'Değer gerekli'),
    scope: z.enum(['global', 'category']),
    categoryId: z.string(),
    minCartValue: z.string(),
    minQuantity: z.string(),
    buyQuantity: z.string(),
    getQuantity: z.string(),
    maxDiscountAmount: z.string(),
    usageLimitTotal: z.string(),
    usageLimitPerUser: z.string(),
    isStackable: z.boolean(),
    isActive: z.boolean(),
    isFlashSale: z.boolean(),
    startDate: z.string().min(1, 'Başlangıç tarihi gerekli'),
    endDate: z.string().min(1, 'Bitiş tarihi gerekli'),
  })
  .refine((d) => d.scope !== 'category' || d.categoryId.length > 0, {
    message: 'Kategori seçin',
    path: ['categoryId'],
  });

export type DiscountFormValues = z.infer<typeof discountSchema>;
