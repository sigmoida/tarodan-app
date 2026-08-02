/** @format */

"use client";

import type { ReactNode } from "react";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { ProfileProvider, useProfile } from "../_context/ProfileContext";
import { PROFILE_PANE_MAX_HEIGHT, PROFILE_STICKY_TOP } from "../_lib/layout";
import ProfileNavDrawer from "./ProfileNavDrawer";
import ProfileSidebar from "./ProfileSidebar";

/**
 * The two-column frame. Once auth has resolved to a guest (`mounted &&
 * !authLoading && !isAuthenticated`), the `ProfileContext` redirect to /login is
 * in flight — don't paint the account content in that window (the flash). While
 * auth is still resolving (`authLoading`) an authed user keeps their SSR content,
 * so this gate never shows a spinner to a logged-in visitor.
 */
function ProfileFrame({ children }: { children: ReactNode }) {
  const { mounted, authLoading, isAuthenticated } = useProfile();

  if (mounted && !authLoading && !isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0">
        <div
          className={`lg:sticky lg:overflow-y-auto ${PROFILE_STICKY_TOP} ${PROFILE_PANE_MAX_HEIGHT}`}
        >
          <ProfileSidebar />
        </div>
      </aside>
      {/* `lg` altında kenar çubuğu yerine başlıktaki hamburger'dan açılan
          panel — aynı bileşen, aynı içerik. */}
      <ProfileNavDrawer />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * The `/profile/*` two-column frame: a sticky account nav on the left (the
 * standing counterpart to the header account popover) and the routed page in
 * the main column. Owns the single `ProfileProvider` so the sidebar and every
 * child page share one profile-overview query. Below `lg` the sidebar collapses
 * — the header popover covers navigation there.
 */
export default function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <ProfileProvider>
      <ProfileFrame>{children}</ProfileFrame>
    </ProfileProvider>
  );
}
