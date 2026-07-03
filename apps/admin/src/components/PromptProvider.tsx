"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { Dialog, ModalFooter, Textarea, Input, Label, FormField } from "@tarodan/ui";

export interface PromptOptions {
  title?: string;
  /** Input üstünde gösterilen açıklama. */
  description?: ReactNode;
  /** Input etiketi. */
  label?: string;
  placeholder?: string;
  /** Başlangıç değeri. */
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Boş bırakılamaz (varsayılan: true). */
  required?: boolean;
  /** Zorunlu alan boşken gösterilecek hata metni. */
  requiredMessage?: string;
  /** Çok satırlı (textarea). Varsayılan: true. */
  multiline?: boolean;
  maxLength?: number;
  /** Onay butonunu kırmızı (yıkıcı) stille gösterir. */
  destructive?: boolean;
}

/** Onayla → girilen (trim'lenmiş) metin, Vazgeç → null. */
type PromptFn = (options?: PromptOptions) => Promise<string | null>;

const PromptContext = createContext<PromptFn | null>(null);

/**
 * Native window.prompt yerine kullanılan, ui-uyumlu metin giriş dialog'u.
 * Tek bir dialog global olarak render edilir; `usePrompt()` her yerden
 * `await prompt({...})` ile çağrılır.
 *
 * @see ConfirmProvider — aynı desenin onay (yes/no) karşılığı.
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
        // Her açılışta taze state (value/error) için koşullu render.
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
  const {
    title = "Bir değer girin",
    description,
    label,
    placeholder,
    defaultValue = "",
    confirmLabel = "Onayla",
    cancelLabel = "Vazgeç",
    required = true,
    requiredMessage = "Bu alan zorunludur",
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

/** Metin giriş dialog'unu açan async fonksiyon. PromptProvider altında kullanılmalı. */
export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) {
    throw new Error("usePrompt, PromptProvider içinde kullanılmalı");
  }
  return ctx;
}
