/** @format */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { getSession } from "@/lib/server/session";

/**
 * Authoritative auth gate for the whole seller area. `middleware.ts` bounces
 * cookieless guests at the edge; this verifies the session against the API
 * (catching a present-but-expired cookie) before rendering any `/seller/*` route.
 * The seller area is behind auth, so it is not indexable.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SellerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session)
    // "/seller" diye bir rota yok — login sonrası gerçek bir hedefe düş
    // (e-posta linkleri /seller/orders/:id gibi derin hedefler taşıyabilir;
    // path'i layout bilemediği için güvenli varsayılan satıcı paneli).
    redirect({
      href: "/login?redirect=/seller/dashboard",
      locale: await getLocale(),
    });
  return <>{children}</>;
}
