import { z } from 'zod';

/** Car model create/edit. Years kept as strings (native number input); shaped in mutationFn. */
export const carModelSchema = z.object({
  brandId: z.string().min(1, 'Marka seçiniz'),
  name: z.string().trim().min(1, 'Model adı zorunlu').max(120, 'En fazla 120 karakter'),
  yearStart: z.string().optional().or(z.literal('')),
  yearEnd: z.string().optional().or(z.literal('')),
  isActive: z.boolean(),
});

export type CarModelFormValues = z.infer<typeof carModelSchema>;
