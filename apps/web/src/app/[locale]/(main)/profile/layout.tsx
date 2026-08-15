/** @format */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/server/session";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import ProfileShell from "./_components/ProfileShell";
import { buildOverviewSeed } from "./_lib/overview-seed";

/**
 * Server shell + authoritative auth gate for the account area. `middleware.ts`
 * already bounces cookieless guests at the edge; this verifies the session
 * against the API (catching a present-but-expired cookie) before rendering any
 * `/profile/*` route, then renders the client `ProfileShell` (sticky account
 * nav + main column). The account area is never indexable, so `robots: noindex`
 * is set here at the layout — the client page roots can't export metadata, and
 * this no longer relies on the site-wide root default.
 *
 * It also seeds the profile overview query from the verified session so the
 * dashboard header (name / avatar / tier) ships in the first HTML instead of
 * flashing a placeholder. The seed is marked stale (`dataUpdatedAt = 0`) so the
 * client refetches the full 8-call aggregate once on mount to fill the stats /
 * pending counts — SSR identity, client stats, no double-paint.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ProfileLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session)
    redirect({ href: "/login?redirect=/profile", locale: await getLocale() });
  // `redirect` throws, so `session` is non-null past here — but next-intl's
  // redirect return type doesn't let TS's control flow infer that (unlike
  // next/navigation's), so narrow it explicitly.
  const user = session!;

  const t = await getTranslations();
  const queryClient = getServerQueryClient();
  queryClient.setQueryData(
    queryKeys.profile.overview(),
    buildOverviewSeed(user, t),
  );
  const seeded = queryClient
    .getQueryCache()
    .find({ queryKey: queryKeys.profile.overview() });
  if (seeded) seeded.state.dataUpdatedAt = 0;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProfileShell>{children}</ProfileShell>
    </HydrationBoundary>
  );
}
