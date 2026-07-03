import { z } from 'zod';

export const manufacturerSchema = z.object({
  name: z.string().trim().min(1, 'Üretici adı zorunlu').max(120, 'En fazla 120 karakter'),
  logo: z.string().trim().optional().or(z.literal('')),
  website: z.string().trim().optional().or(z.literal('')),
  country: z.string().trim().max(80).optional().or(z.literal('')),
  foundedYear: z.string().optional().or(z.literal('')),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  isActive: z.boolean(),
});

export type ManufacturerFormValues = z.infer<typeof manufacturerSchema>;
