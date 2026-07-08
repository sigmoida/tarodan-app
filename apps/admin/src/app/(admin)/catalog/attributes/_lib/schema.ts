import { z } from 'zod';

export const attributeGroupSchema = z.object({
  name: z.string().trim().min(1, 'Ad zorunlu').max(120, 'En fazla 120 karakter'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  sortOrder: z.string().optional().or(z.literal('')),
  isRequired: z.boolean(),
  isActive: z.boolean(),
});
export type AttributeGroupFormValues = z.infer<typeof attributeGroupSchema>;

export const attributeSchema = z.object({
  value: z.string().trim().min(1, 'Değer zorunlu').max(120, 'En fazla 120 karakter'),
  displayValue: z.string().trim().max(120).optional().or(z.literal('')),
  color: z.string().optional().or(z.literal('')),
  sortOrder: z.string().optional().or(z.literal('')),
  isActive: z.boolean(),
});
export type AttributeFormValues = z.infer<typeof attributeSchema>;
