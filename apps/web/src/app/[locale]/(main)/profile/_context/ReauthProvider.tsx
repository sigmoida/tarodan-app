"use client";

import type { ReactNode } from "react";
import { AppleSdkScript } from "@/components/auth/AppleSdkScript";
import { ReauthContext, useReauthController } from "../_hooks/useReauth";
import ReauthModal from "../_modals/ReauthModal";

/**
 * Owns the profile page's step-up: one confirm dialog and one in-memory token
 * for every sensitive write below it (`useReauth`). It also loads Apple's SDK,
 * so an Apple confirm or connect can open its popup on the first click.
 */
export default function ReauthProvider({ children }: { children: ReactNode }) {
  const { withReauth, isOpen, confirm, cancel } = useReauthController();
  return (
    <ReauthContext.Provider value={withReauth}>
      {children}
      <AppleSdkScript />
      <ReauthModal open={isOpen} onConfirmed={confirm} onCancel={cancel} />
    </ReauthContext.Provider>
  );
}
