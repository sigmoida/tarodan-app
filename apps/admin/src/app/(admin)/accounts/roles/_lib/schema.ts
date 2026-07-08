import { z } from 'zod';
import { ROLES } from './constants';

/** Staff assign/edit form. On edit only `role` is sent. */
export const staffSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  role: z.enum(ROLES),
  password: z.string().optional(),
  displayName: z.string().optional(),
});

export type StaffFormValues = z.infer<typeof staffSchema>;
