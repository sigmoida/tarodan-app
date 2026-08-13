/** @format */

import type { Metadata } from "next";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getServerQueryClient } from "@/lib/query/server";
import { queryKeys } from "@/lib/query/keys";
import { localizedCanonical, localizedPath } from "@/lib/seo";
import { getServerApiOrigin } from "@/lib/api/origin";
import MembershipClient from "./MembershipClient";

const API_BASE = getServerApiOrigin();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Üyelik Planları · Tarodan",
    description:
      "Tarodan üyelik planları: ilan limitleri, takas, koleksiyonlar ve öne çıkan ilanlar. Size uygun planı seçin.",
    alternates: localizedCanonical(locale, "/membership"),
    openGraph: {
      title: "Üyelik Planları · Tarodan",
      description: "Size uygun Tarodan üyelik planını seçin.",
      type: "website",
      url: localizedPath(locale, "/membership"),
    },
    robots: { index: true, follow: true },
  };
}

/**
 * Public membership page. Server-fetches the tier prices/limits (public,
 * cacheable) and dehydrates them so the plans ship in the first paint; the
 * interactive selection + (when logged in) management run in the client island.
 */
export default async function MembershipPage() {
  const queryClient = getServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.membership.tiers(),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/membership/tiers`, {
        next: { revalidate: 300 },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MembershipClient />
    </HydrationBoundary>
  );
}
