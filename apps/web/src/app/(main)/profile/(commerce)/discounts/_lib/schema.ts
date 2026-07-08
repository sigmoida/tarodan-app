import { z } from 'zod';

/**
 * Validation for the discount create/edit form. `z.infer` is structurally the
 * same shape as `DiscountFormData` (value is a number; the money/limit fields
 * stay strings, coerced at the mutation boundary). The refine enforces the one
 * cross-field rule — a product-scoped discount needs at least one product.
 */
export const discountSchema = z
	.object({
		code: z.string(),
		name: z.string().min(1, 'İndirim adı gerekli'),
		description: z.string(),
		type: z.enum(['percentage', 'fixed_amount']),
		value: z.number().min(0, 'Geçerli bir değer girin'),
		scope: z.enum(['product', 'seller']),
		targetProductIds: z.array(z.string()),
		minCartValue: z.string(),
		maxDiscountAmount: z.string(),
		usageLimitTotal: z.string(),
		usageLimitPerUser: z.string(),
		isStackable: z.boolean(),
		isActive: z.boolean(),
		startDate: z.string().min(1, 'Başlangıç tarihi gerekli'),
		endDate: z.string().min(1, 'Bitiş tarihi gerekli'),
	})
	.refine((d) => d.scope !== 'product' || d.targetProductIds.length > 0, {
		message: 'Lütfen en az bir ürün seçin',
		path: ['targetProductIds'],
	});

export type DiscountFormValues = z.infer<typeof discountSchema>;
