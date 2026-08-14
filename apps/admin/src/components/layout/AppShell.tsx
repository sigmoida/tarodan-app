/** @format */

"use client";

import { useIdleLogout } from "@/hooks/useIdleLogout";
import { useRouteGuard } from "@/hooks/useRouteGuard";
import { useSidebar } from "@/hooks/useSidebar";
import { ForbiddenScreen } from "@/components/page/ForbiddenScreen";
import { Sidebar } from "./Sidebar";
import { SidebarNavDrawer } from "./SidebarNavDrawer";
import { Topbar } from "./Topbar";

/**
 * The authenticated app chrome: sidebar + top bar + page content. Thin
 * composition — all state lives in hooks, all rendering in child components.
 * Session and permissions are provided by the (admin) server layout above.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  // Auto-logout after 1 hour of inactivity (Balanced policy).
  useIdleLogout();
  // Route guard (UX) — instant and race-free since permissions come authoritatively from the server.
  const isRouteAllowed = useRouteGuard();

  const { open, openSidebar, closeSidebar } = useSidebar();

  return (
    <div className="min-h-dvh bg-surface">
      {/* Karartma katmanı artık elle çizilmiyor — `Drawer` (Radix) kendi
          overlay'ini, odak tuzağını ve kaydırma kilidini getiriyor. */}
      <Sidebar />
      <SidebarNavDrawer open={open} onClose={closeSidebar} />

      {/* pt-[--admin-topbar-h] clears the fixed Topbar (which is out of flow). */}
      <div className="min-w-0 pt-[var(--admin-topbar-h)] lg:pl-[var(--admin-sidebar-w)]">
        <Topbar onOpenSidebar={openSidebar} />
        <main className="min-w-0 p-4 sm:p-6">
          {isRouteAllowed ? children : <ForbiddenScreen />}
        </main>
      </div>
    </div>
  );
}
