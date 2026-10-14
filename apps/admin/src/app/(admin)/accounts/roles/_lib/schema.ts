import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { newPasswordOptionalSchema } from '@tarodan/ui/form';
import { ROLES } from './constants';

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Staff assign/edit form. On edit only `role` is sent. The optional initial
 * password follows the shared policy (API: `@IsPassword()`); empty lets the
 * API generate a temporary one.
 */
export const staffSchema = (t: T) =>
  z.object({
    email: z.string().email(t('admin.roles.emailInvalid')),
    role: z.enum(ROLES),
    password: newPasswordOptionalSchema(t),
    displayName: z.string().optional(),
  });

export type StaffFormValues = z.infer<ReturnType<typeof staffSchema>>;
