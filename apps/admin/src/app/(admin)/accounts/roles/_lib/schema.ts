import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { ROLES } from './constants';

type T = ReturnType<typeof useTranslations<never>>;

/** Staff assign/edit form. On edit only `role` is sent. */
export const staffSchema = (t: T) =>
  z.object({
    email: z.string().email(t('admin.roles.emailInvalid')),
    role: z.enum(ROLES),
    password: z.string().optional(),
    displayName: z.string().optional(),
  });

export type StaffFormValues = z.infer<ReturnType<typeof staffSchema>>;
