"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type {
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";
import { Modal, type ModalProps } from "../Modal";
import { ModalFooter } from "../Dialog";
import { useConfirm, type ConfirmOptions } from "../ConfirmProvider";
import { Form } from "./Form";

const defaultDiscardConfirmation: ConfirmOptions = {
  title: "Kaydedilmemiş değişiklikler",
  description:
    "Yaptığınız değişiklikler kaybolacak. Formu kapatmak istiyor musunuz?",
  confirmLabel: "Değişiklikleri Sil",
  cancelLabel: "Düzenlemeye Devam Et",
  destructive: true,
};

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
  closeLabel?: string;
  size?: ModalProps["size"];
  maxWidth?: ModalProps["maxWidth"];
  /** Optional width/layout override for editor-style split panes. */
  modalClassName?: string;
  /** Keep complex editors open when their backdrop is clicked. */
  closeOnBackdrop?: boolean;
  /** Customize the dirty-form warning, or set false to disable it. */
  discardConfirmation?: ConfirmOptions | false;
  /** Danger styling for the submit button (destructive confirmations, e.g. refund/cancel). */
  destructive?: boolean;
  children: ReactNode;
}

/**
 * Generic create/edit modal = design-system `Modal` + the RHF `Form` + a standard
 * Cancel/Submit footer. The resource modal owns the `form` (schema + defaults) and
 * its mutation; FormModal only frames them, so it stays schema-agnostic and
 * reusable across every admin AND web CRUD screen.
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
  submitLabel = "Kaydet",
  cancelLabel = "İptal",
  closeLabel = "Kapat",
  size = "lg",
  maxWidth,
  modalClassName,
  closeOnBackdrop,
  discardConfirmation = defaultDiscardConfirmation,
  destructive,
  children,
}: FormModalProps<T>) {
  const pending = isSubmitting ?? form.formState.isSubmitting;
  const confirm = useConfirm();

  // Reset only on the false→true edge (avoids clobbering keystrokes each render).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current && resetValues) form.reset(resetValues);
    wasOpen.current = open;
  }, [open, resetValues, form]);

  const close = async () => {
    if (pending) return;
    if (
      form.formState.isDirty &&
      discardConfirmation !== false &&
      !(await confirm(discardConfirmation))
    ) {
      return;
    }
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title={title}
      size={size}
      maxWidth={maxWidth}
      className={modalClassName}
      closeOnBackdrop={closeOnBackdrop}
      closeLabel={closeLabel}
      dismissDisabled={pending}
      footer={
        <ModalFooter
          onCancel={close}
          onConfirm={() => void form.handleSubmit(onSubmit)()}
          cancelLabel={cancelLabel}
          confirmLabel={submitLabel}
          isLoading={pending}
          destructive={destructive}
        />
      }
    >
      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        {children}
      </Form>
    </Modal>
  );
}
