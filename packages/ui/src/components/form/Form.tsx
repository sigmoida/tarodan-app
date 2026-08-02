"use client";

import * as React from "react";
import {
  FormProvider,
  useFormContext,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from "react-hook-form";
import { Input, type InputProps } from "../Input";
import { cn } from "../../lib/utils";

/**
 * RHF-connected form primitives. Pair with `useZodForm`:
 *
 *   const form = useZodForm(schema);
 *   <Form form={form} onSubmit={handle}>
 *     <FormError />
 *     <FormInput name="email" label="E-posta" />
 *     <Button type="submit" isLoading={form.formState.isSubmitting}>Gönder</Button>
 *   </Form>
 *
 * Field components auto-wire their value + validation error from context, so
 * callers never thread `register`/`error` by hand.
 */
export interface FormProps<T extends FieldValues> extends Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  "onSubmit"
> {
  form: UseFormReturn<T>;
  onSubmit: SubmitHandler<T>;
  children: React.ReactNode;
}

export function Form<T extends FieldValues>({
  form,
  onSubmit,
  className,
  children,
  ...props
}: FormProps<T>) {
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className={className}
        {...props}
      >
        {children}
      </form>
    </FormProvider>
  );
}

export interface FormInputProps extends Omit<InputProps, "name" | "error"> {
  /** Field name in the form schema. */
  name: string;
}

/** Text input wired to the form by `name`. */
export function FormInput({ name, ...props }: FormInputProps) {
  const { register, formState } = useFormContext();
  const error = formState.errors[name]?.message as string | undefined;
  return <Input error={error} {...props} {...register(name)} />;
}

/** Form-level error banner — shows the RHF `root` error (e.g. a server error). */
export function FormError({ className }: { className?: string }) {
  const { formState } = useFormContext();
  const message = formState.errors.root?.message as string | undefined;
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700",
        className,
      )}
    >
      {message}
    </div>
  );
}
