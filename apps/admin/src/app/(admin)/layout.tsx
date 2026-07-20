import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { getPermissions } from "@/lib/server/permissions";
import { routePermission } from "@/lib/navigation";
import { SessionProvider } from "@/context/SessionContext";
import { PermissionsProvider } from "@/context/PermissionsContext";
import { AdminProviders } from "@/provider/AdminProviders";
import { AppShell } from "@/components/layout/AppShell";
import { RouteMetadata } from "@/components/RouteMetadata";

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
  if (!user) redirect("/login");

  const permissions = await getPermissions(user);
  const pathname = headers().get("x-admin-pathname");
  if (!pathname) notFound();

  const requiredPermission = routePermission(pathname);
  if (
    requiredPermission &&
    !permissions.isSuperAdmin &&
    !permissions.keys.includes(requiredPermission)
  ) {
    notFound();
  }

  return (
    <SessionProvider user={user}>
      <PermissionsProvider permissions={permissions}>
        <AdminProviders>
          <RouteMetadata />
          <AppShell>{children}</AppShell>
        </AdminProviders>
      </PermissionsProvider>
    </SessionProvider>
  );
}
