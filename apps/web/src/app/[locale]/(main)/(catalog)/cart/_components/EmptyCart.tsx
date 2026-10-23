/** @format */

"use client";

import { ShoppingCartIcon } from "@heroicons/react/24/outline";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTranslations } from "next-intl";

/** Same structure as empty Favorites and the mobile cart: page title, then the empty state. */
export default function EmptyCart() {
  const t = useTranslations();
  return (
    <PageShell>
      <PageHeader title={t("cart.myCart")} />
      <EmptyState
        icon={<ShoppingCartIcon className="h-7 w-7" />}
        title={t("cart.empty")}
        description={t("cart.emptyDesc")}
        action={
          <ButtonLink href="/listings">{t("cart.browseListings")}</ButtonLink>
        }
      />
    </PageShell>
  );
}
