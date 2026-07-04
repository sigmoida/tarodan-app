import { z } from 'zod';
import { ROLES } from './constants';

/** Yönetici atama/düzenleme formu. Düzenlemede yalnızca `role` gönderilir. */
export const staffSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  role: z.enum(ROLES),
  password: z.string().optional(),
  displayName: z.string().optional(),
});

export type StaffFormValues = z.infer<typeof staffSchema>;
