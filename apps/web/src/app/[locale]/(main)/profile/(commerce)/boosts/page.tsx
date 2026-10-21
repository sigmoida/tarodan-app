/** @format */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { useBoostLauncher } from "@/components/boost/useBoostLauncher";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import BoostSection from "./_components/BoostSection";
import type { BoostGroup } from "./_lib/boosts";

type Section = "current" | "history";

export default function MyBoostsPage() {
  const t = useTranslations();
  const { ready } = useRequireAuth();
  const [section, setSection] = useState<Section>("current");
  const boost = useBoostLauncher();

  if (!ready) return <AuthLoadingScreen />;

  const extend = (group: BoostGroup) =>
    boost.open({
      id: group.productId,
      title: group.product.title,
      boostedUntil: group.product.boostedUntil,
    });

  return (
    <PageShell className="pb-16">
      <PageHeader title={t("profile.boosts.title")} />

      <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
        <TabsList className="w-full">
          <TabsTrigger value="current">
            {t("profile.boosts.sections.current")}
          </TabsTrigger>
          <TabsTrigger value="history">
            {t("profile.boosts.sections.history")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Keyed so each tab keeps its own page and starts fresh when revisited. */}
      <BoostSection key={section} state={section} onExtend={extend} />

      <p className="text-sm text-muted">
        <Link href="/support" className="text-primary-600 underline">
          {t("profile.boosts.support")}
        </Link>
      </p>

      {boost.dialog}
    </PageShell>
  );
}
