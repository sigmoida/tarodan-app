/** @format */

import { getTranslations } from "next-intl/server";
import { Logo } from "@tarodan/ui/logo";

/**
 * Layout for unauthenticated pages (login, forgot-password). Pure passthrough —
 * a primary header with the brand on the left + a centered card frame below.
 *
 * The "already logged in → /dashboard" bounce used to live here as an
 * `await getSession()` redirect. That made this an async layout that suspended
 * on a network call, and after login the Server Action revalidates /login and
 * re-runs it — flashing a blank frame before landing on /dashboard (same issue
 * web had). The bounce now happens at the edge in `middleware.ts`
 * (guestOnlyPaths), before render and only on real navigations.
 *
 * Async (like the root layout) so the footer copyright line can come from the
 * request-resolved locale via `getTranslations`.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center bg-primary-500 px-6 shadow-sm">
        <Logo style={{ maxHeight: "40px", width: "auto" }} />
      </header>

      <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-surface via-surface-elevated to-surface-alt px-4 py-10">
        <div className="w-full max-w-md">
          {children}

          <p className="mt-6 text-center text-sm text-muted">
            {t("admin.auth.layout.copyright")}
          </p>
        </div>
      </main>
    </div>
  );
}
