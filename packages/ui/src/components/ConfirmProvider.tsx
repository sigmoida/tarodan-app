"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "./Dialog";

export interface ConfirmOptions {
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red style for destructive actions (delete, discard, etc.). */
  destructive?: boolean;
  /** Async action to run after confirmation while the dialog stays open. */
  onConfirm?: () => void | Promise<unknown>;
}

export type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Shared async confirmation layer used by both applications and FormModal. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback<ConfirmFn>((options = {}) => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const settle = (value: boolean) => {
    state?.resolve(value);
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
      // The caller owns error feedback. Keep the dialog open for retry.
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

/** Opens the shared confirmation dialog. Must be used under ConfirmProvider. */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm)
    throw new Error("useConfirm must be used within ConfirmProvider");
  return confirm;
}
