"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "@tarodan/ui";

export interface ConfirmOptions {
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red style for destructive actions (delete, etc.). */
  destructive?: boolean;
}

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * A ui-consistent confirmation dialog used instead of native window.confirm.
 * A single dialog is rendered globally; `useConfirm()` is called from anywhere
 * via `await confirm({...})` (true=confirm, false=cancel).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback<ConfirmFn>((options = {}) => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const settle = (val: boolean) => {
    state?.resolve(val);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={!!state}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
        title={state?.options.title}
        description={state?.options.description}
        confirmLabel={state?.options.confirmLabel}
        cancelLabel={state?.options.cancelLabel}
        destructive={state?.options.destructive}
      />
    </ConfirmContext.Provider>
  );
}

/** Async function that opens the confirm dialog. Must be used under ConfirmProvider. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm, ConfirmProvider içinde kullanılmalı");
  }
  return ctx;
}
