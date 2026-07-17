"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageLoading } from "@/components/PageLoading";
import { PageHeader } from "@/components/AdminList";
import { SectionCard } from "@/components/detail/SectionCard";
import { readSetting } from "@/lib/settings";
import { extractList } from "@/lib/extract";
import { TierCard } from "./_components/TierCard";
import { YearlyDiscountForm } from "./_components/YearlyDiscountForm";
import { TierFormModal } from "./_modals/TierFormModal";
import { type MembershipTier } from "./_lib/types";

/** Pull yearly_discount_percentage out of the settings payload (array or object). */
function parseYearlyDiscount(raw: unknown): number {
  const v = readSetting(raw, "yearly_discount_percentage");
  const n = v != null ? parseFloat(v) : NaN;
  return Number.isNaN(n) ? 20 : n;
}

export default function MembershipTiersPage() {
  const t = useTranslations();
  const [editing, setEditing] = useState<MembershipTier | null>(null);

  const { data: tiers = [], isLoading } = useQuery<MembershipTier[]>({
    queryKey: ["membership-tiers"],
    queryFn: async () =>
      extractList<MembershipTier>(await adminApi.getMembershipTiers()),
  });

  const { data: yearlyDiscount = 20 } = useQuery({
    queryKey: ["membership-yearly-discount"],
    queryFn: async () => {
      const res = await adminApi.getSettings();
      return parseYearlyDiscount(res.data?.data ?? res.data ?? []);
    },
  });

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.tiers.page.title")}
        description={t("admin.tiers.page.description")}
      />

      <YearlyDiscountForm value={yearlyDiscount} />

      {isLoading ? (
        <PageLoading />
      ) : tiers.length === 0 ? (
        <SectionCard>
          <p className="py-8 text-center text-muted">
            {t("admin.tiers.page.empty")}
          </p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              yearlyDiscount={yearlyDiscount}
              onEdit={() => setEditing(tier)}
            />
          ))}
        </div>
      )}

      {editing && (
        <TierFormModal
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          tier={editing}
          yearlyDiscount={yearlyDiscount}
        />
      )}
    </AdminPage>
  );
}
