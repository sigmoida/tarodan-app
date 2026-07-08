import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

/**
 * `useForm` pre-wired with a zod schema. Form values (and their types) are
 * inferred from the schema — one source of truth for validation + types.
 */
export function useZodForm<Schema extends z.ZodType>(
  schema: Schema,
  options?: Omit<UseFormProps<z.input<Schema>>, 'resolver'>,
): UseFormReturn<z.input<Schema>> {
  return useForm<z.input<Schema>>({
    ...options,
    resolver: zodResolver(schema),
  });
}
