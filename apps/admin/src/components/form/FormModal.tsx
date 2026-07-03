'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { FieldValues, SubmitHandler, UseFormReturn } from 'react-hook-form';
import { Modal, Button, type ModalProps } from '@tarodan/ui';
import { Form } from '@tarodan/ui/form';

export interface FormModalProps<T extends FieldValues> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The form instance (from `useZodForm`) — owned by the resource modal. */
  form: UseFormReturn<T>;
  onSubmit: SubmitHandler<T>;
  /** Pending flag — pass the mutation's `isPending`; falls back to RHF isSubmitting. */
  isSubmitting?: boolean;
  /** When set, `form.reset(resetValues)` runs on each open (false→true) edge. */
  resetValues?: T;
  submitLabel?: string;
  cancelLabel?: string;
  maxWidth?: ModalProps['maxWidth'];
  children: ReactNode;
}

/**
 * Generic create/edit modal = design-system `Modal` + the RHF `Form` + a standard
 * Cancel/Submit footer. The resource modal owns the `form` (schema + defaults) and
 * the `useAdminMutation`; FormModal only frames them, so it stays schema-agnostic
 * and reusable across every admin CRUD screen.
 *
 * Prefer mounting with `key={editing?.id ?? 'new'}` so `useZodForm({defaultValues})`
 * seeds fresh values per open. `resetValues` is the fallback for always-mounted use.
 */
export function FormModal<T extends FieldValues>({
  open,
  onClose,
  title,
  form,
  onSubmit,
  isSubmitting,
  resetValues,
  submitLabel = 'Kaydet',
  cancelLabel = 'İptal',
  maxWidth = 'max-w-lg',
  children,
}: FormModalProps<T>) {
  const pending = isSubmitting ?? form.formState.isSubmitting;

  // Reset only on the false→true edge (avoids clobbering keystrokes each render).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current && resetValues) form.reset(resetValues);
    wasOpen.current = open;
  }, [open, resetValues, form]);

  const close = () => {
    if (!pending) onClose();
  };

  return (
    <Modal isOpen={open} onClose={close} title={title} maxWidth={maxWidth}>
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        {children}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={close} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="submit" variant="primary" isLoading={pending}>
            {submitLabel}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
