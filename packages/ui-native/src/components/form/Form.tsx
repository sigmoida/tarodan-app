import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Controller,
  FormProvider,
  useFormContext,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';
import { Input, type InputProps } from '../Input';
import { theme } from '../../lib/theme';

/**
 * RHF-connected form primitives for React Native. Pair with `useZodForm`:
 *
 *   const form = useZodForm(schema);
 *   <Form form={form}>
 *     <FormError />
 *     <FormInput name="email" label="E-posta" />
 *     <Button onPress={form.handleSubmit(handle)} isLoading={form.formState.isSubmitting}>
 *       Gönder
 *     </Button>
 *   </Form>
 *
 * RN has no <form> element, so submission is triggered by the caller via
 * `form.handleSubmit`. Fields bind through Controller (RN inputs are controlled).
 */
export function Form<T extends FieldValues>({
  form,
  children,
}: {
  form: UseFormReturn<T>;
  children: React.ReactNode;
}) {
  // Wrap in a fragment: react-hook-form's FormProvider is typed against React
  // 18's ReactNode, while ui-native uses React 19 types (which add `bigint`).
  return (
    <FormProvider {...form}>
      <>{children}</>
    </FormProvider>
  );
}

export interface FormInputProps
  extends Omit<InputProps, 'value' | 'onChangeText' | 'onBlur' | 'error'> {
  /** Field name in the form schema. */
  name: string;
}

/** Text input wired to the form by `name` via Controller. */
export function FormInput({ name, ...props }: FormInputProps) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          {...props}
          value={field.value ?? ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

/** Form-level error banner — shows the RHF `root` error (e.g. a server error). */
export function FormError() {
  const { formState } = useFormContext();
  const message = formState.errors.root?.message as string | undefined;
  if (!message) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.danger[200]!,
    backgroundColor: theme.colors.danger[50]!,
    padding: theme.spacing[3],
  },
  text: {
    color: theme.colors.danger[700]!,
    fontSize: theme.typography.fontSize.sm,
  },
});
