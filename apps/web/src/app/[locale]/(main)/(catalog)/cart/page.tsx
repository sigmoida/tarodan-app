/** @format */

import type { Metadata } from "next";
import CartClient from "./CartClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.cart.page.sepetimTarodan"),
    description: t(
      "page.cart.page.sepetinizdekiUrunleriGozdenGecirinVeGuvenle",
    ),
    robots: { index: false, follow: false },
  };
}

export default function CartPage() {
  return <CartClient />;
}
