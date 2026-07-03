'use client';

import { useFormContext } from 'react-hook-form';
import { Checkbox, type CheckboxProps } from '../Checkbox';

export interface FormCheckboxProps extends Omit<CheckboxProps, 'name' | 'error'> {
  /** Field name in the form schema (should be a boolean field). */
  name: string;
}

/**
 * Checkbox wired to the form by `name`. RHF binds checkbox `.checked` natively,
 * so a `z.boolean()` field round-trips as long as defaultValues seed a boolean.
 */
export function FormCheckbox({ name, ...props }: FormCheckboxProps) {
  const { register, formState } = useFormContext();
  const error = formState.errors[name]?.message as string | undefined;
  return <Checkbox error={error} {...props} {...register(name)} />;
}
