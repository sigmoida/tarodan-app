'use client';

import { useFormContext } from 'react-hook-form';
import { Textarea, type TextareaProps } from '../Textarea';

export interface FormTextareaProps extends Omit<TextareaProps, 'name' | 'error'> {
  /** Field name in the form schema. */
  name: string;
}

/** Textarea wired to the form by `name`. */
export function FormTextarea({ name, ...props }: FormTextareaProps) {
  const { register, formState } = useFormContext();
  const error = formState.errors[name]?.message as string | undefined;
  return <Textarea error={error} {...props} {...register(name)} />;
}
