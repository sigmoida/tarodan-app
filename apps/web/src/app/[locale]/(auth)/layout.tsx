import type { Metadata } from "next";
import QueryProvider from "@/components/QueryProvider";

/** Auth pages are never indexable — one layout-level guard so a new page can't
 *  forget it (individual pages may still override title/description). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Layout for unauthenticated pages (login, register, forgot/reset password,
 * verify email). Pure passthrough — deliberately NOT async.
 *
 * The "already logged in → go home" bounce used to live here as
 * `await getSession(); if (session) redirect('/')`. That made this an async
 * layout that SUSPENDED on a network call, and after login the Server Action
 * revalidates `/login`, re-running it and re-streaming a BLANK document before
 * the redirect landed on home. The bounce now happens at the edge in
 * `middleware.ts` (guestOnlyPaths) — before render, only on real navigations —
 * so there's no async layout, no post-login redirect here, and no blank.
 *
 * Keeps a single QueryClient for the group — the auth forms use TanStack
 * mutations and (main)'s provider doesn't wrap this route group.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <QueryProvider>{children}</QueryProvider>;
}
