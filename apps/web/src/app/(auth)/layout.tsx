import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';

/** Auth pages are never indexable — one layout-level guard so a new page can't
 *  forget it (individual pages may still override title/description). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Layout for unauthenticated pages (login, register, forgot/reset password,
 * verify email). Server Component: if a valid session already exists, bounce to
 * the marketplace before rendering — one server-side guard replacing the
 * inconsistent per-page `useEffect` redirects (and fixing login, which had none).
 *
 * The shared brand frame (logo header + gradient + footer) moves here as each
 * page is thinned onto `AuthCard` + extracted form components; until then the
 * pages carry their own frame, so this layout stays a passthrough.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session) redirect('/');

  return <>{children}</>;
}
