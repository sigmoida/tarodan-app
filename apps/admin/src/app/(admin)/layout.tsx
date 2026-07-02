import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';
import { SessionProvider } from '@/lib/session-context';
import AdminLayout from '@/components/AdminLayout';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { PromptProvider } from '@/components/PromptProvider';
import { QueryProvider } from '@/components/QueryProvider';

/**
 * Layout for the authenticated app. Server Component: resolves the session
 * server-side and redirects to /login when it's missing/invalid, so gating
 * never depends on client state. The resolved user is provided to client
 * components via SessionProvider.
 */
export default async function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  return (
    <SessionProvider user={user}>
      <QueryProvider>
        <ConfirmProvider>
          <PromptProvider>
            <AdminLayout>{children}</AdminLayout>
          </PromptProvider>
        </ConfirmProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
