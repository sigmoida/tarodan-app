"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
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
  /** Async action to run after confirmation while the dialog stays open. */
  onConfirm?: () => void | Promise<unknown>;
}

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * A ui-consistent confirmation dialog used instead of native window.confirm.
 * A single dialog is rendered globally; `useConfirm()` is called from anywhere
 * via `await confirm({...})` (true=confirm, false=cancel).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);
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
    setIsLoading(false);
    loadingRef.current = false;
  };

  const handleConfirm = async () => {
    if (!state || loadingRef.current) return;
    if (!state.options.onConfirm) {
      settle(true);
      return;
    }

    loadingRef.current = true;
    setIsLoading(true);
    try {
      await state.options.onConfirm();
      settle(true);
    } catch {
      // The mutation owns error feedback. Keep the dialog open for retry.
      loadingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!loadingRef.current) settle(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={!!state}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={state?.options.title}
        description={state?.options.description}
        confirmLabel={state?.options.confirmLabel}
        cancelLabel={state?.options.cancelLabel}
        destructive={state?.options.destructive}
        isLoading={isLoading}
      />
    </ConfirmContext.Provider>
  );
}

/** Async function that opens the confirm dialog. Must be used under ConfirmProvider. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
  // eslint-disable-next-line @tarodan/no-hardcoded-turkish -- developer-facing hook-misuse error
    throw new Error("useConfirm, ConfirmProvider içinde kullanılmalı");
  }
  return ctx;
}
