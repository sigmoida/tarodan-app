"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Dialog, ModalFooter, Textarea, Input, Label, FormField } from "@tarodan/ui";

export interface PromptOptions {
  title?: string;
  /** Description shown above the input. */
  description?: ReactNode;
  /** Input label. */
  label?: string;
  placeholder?: string;
  /** Initial value. */
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Cannot be left empty (default: true). */
  required?: boolean;
  /** Error text shown when a required field is empty. */
  requiredMessage?: string;
  /** Multi-line (textarea). Default: true. */
  multiline?: boolean;
  maxLength?: number;
  /** Shows the confirm button with the red (destructive) style. */
  destructive?: boolean;
}

/** Confirm → the entered (trimmed) text, Cancel → null. */
type PromptFn = (options?: PromptOptions) => Promise<string | null>;

const PromptContext = createContext<PromptFn | null>(null);

/**
 * A ui-consistent text input dialog used instead of native window.prompt.
 * A single dialog is rendered globally; `usePrompt()` is called from anywhere
 * via `await prompt({...})`.
 *
 * @see ConfirmProvider — the confirm (yes/no) counterpart of the same pattern.
 */
export function PromptProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    options: PromptOptions;
    resolve: (v: string | null) => void;
  } | null>(null);

  const prompt = useCallback<PromptFn>((options = {}) => {
    return new Promise<string | null>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const settle = (val: string | null) => {
    state?.resolve(val);
    setState(null);
  };

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      {state && (
        // Conditional render for fresh state (value/error) on each open.
        <PromptDialog
          options={state.options}
          onCancel={() => settle(null)}
          onSubmit={(v) => settle(v)}
        />
      )}
    </PromptContext.Provider>
  );
}

function PromptDialog({
  options,
  onCancel,
  onSubmit,
}: {
  options: PromptOptions;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const t = useTranslations();
  const {
    title = t("admin.shared.prompt.defaultTitle"),
    description,
    label,
    placeholder,
    defaultValue = "",
    confirmLabel = t("common.confirm"),
    cancelLabel = t("admin.shared.prompt.cancel"),
    required = true,
    requiredMessage = t("admin.shared.prompt.requiredMessage"),
    multiline = true,
    maxLength,
    destructive,
  } = options;

  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (v: string) => {
    setValue(v);
    if (error) setError(null);
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (required && !trimmed) {
      setError(requiredMessage);
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Dialog isOpen onClose={onCancel} title={title}>
      <div className="space-y-4">
        {description && <p className="text-sm text-body">{description}</p>}

        <FormField>
          {label && <Label>{label}</Label>}
          {multiline ? (
            <Textarea
              autoFocus
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              rows={3}
            />
          ) : (
            <Input
              autoFocus
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          )}
        </FormField>

        {error && <div className="text-sm text-danger-600">{error}</div>}

        <ModalFooter
          onCancel={onCancel}
          onConfirm={handleSubmit}
          cancelLabel={cancelLabel}
          confirmLabel={confirmLabel}
          destructive={destructive}
        />
      </div>
    </Dialog>
  );
}

/** Async function that opens the text input dialog. Must be used under PromptProvider. */
export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) {
  // eslint-disable-next-line @tarodan/no-hardcoded-turkish -- developer-facing hook-misuse error
    throw new Error("usePrompt, PromptProvider içinde kullanılmalı");
  }
  return ctx;
}
