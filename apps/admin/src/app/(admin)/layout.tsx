import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';
import { getPermissions } from '@/lib/server/permissions';
import { SessionProvider } from '@/context/SessionContext';
import { PermissionsProvider } from '@/context/PermissionsContext';
import { AdminProviders } from '@/provider/AdminProviders';
import { AppShell } from '@/components/layout/AppShell';

/**
 * Layout for the authenticated app. Server Component: resolves the session and
 * the user's permissions server-side, redirecting to /login when the session is
 * missing/invalid — gating never depends on client state. Both are provided to
 * client components via context; the client never fetches them itself.
 */
export default async function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  const permissions = await getPermissions(user);

  return (
    <SessionProvider user={user}>
      <PermissionsProvider permissions={permissions}>
        <AdminProviders>
          <AppShell>{children}</AppShell>
        </AdminProviders>
      </PermissionsProvider>
    </SessionProvider>
  );
}
