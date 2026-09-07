import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { expiredLoginHref } from "@/lib/auth-redirect";
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
  const pathname = (await headers()).get("x-admin-pathname");
  // Bu profil çağrısı oturumu UZATIR; son tarihi de yakala. Yanıtı gateway
  // proxy'sinden geçmediği için başlık kendiliğinden tarayıcıya ulaşmıyor ve
  // XHR atmayan bir sayfada panelin sayacı geride kalıyordu.
  let sessionExpiresAt: string | null = null;
  const user = await getSession({
    onResponse: (res) => {
      sessionExpiresAt = res.headers.get("x-admin-session-expires-at");
    },
  });
  if (!user) redirect(expiredLoginHref("session", pathname ?? "/dashboard"));

  const permissions = await getPermissions(user);
  const requiredPermission = pathname ? routePermission(pathname) : null;
  if (
    requiredPermission &&
    !permissions.isSuperAdmin &&
    !permissions.keys.includes(requiredPermission)
  ) {
    redirect("/forbidden");
  }

  return (
    <SessionProvider user={user} sessionExpiresAt={sessionExpiresAt}>
      <PermissionsProvider permissions={permissions}>
        <AdminProviders>
          <RouteMetadata />
          <AppShell>{children}</AppShell>
        </AdminProviders>
      </PermissionsProvider>
    </SessionProvider>
  );
}
