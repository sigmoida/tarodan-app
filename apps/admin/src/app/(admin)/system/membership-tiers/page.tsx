"use client";

import { useTranslations } from "next-intl";
import { ResourceList } from "@/components/list";
import { SectionCard } from "@/components/detail/SectionCard";
import { TierCard } from "./_components/TierCard";
import { YearlyDiscountForm } from "./_components/YearlyDiscountForm";
import { TierFormModal } from "./_modals/TierFormModal";
import { type MembershipTier } from "./_lib/types";
import {
  membershipTiersFetcher,
  useMembershipTiersPage,
} from "./_lib/useMembershipTiersPage";

export default function MembershipTiersPage() {
  return (
    <ResourceList<MembershipTier>
      resource="membership-tiers"
      fetcher={membershipTiersFetcher}
      getRowId={(tier) => tier.id}
      limit={20}
      syncUrl
    >
      <MembershipTiersContent />
    </ResourceList>
  );
}

function MembershipTiersContent() {
  const t = useTranslations();
  const { rows, yearlyDiscount, yearlyDiscountLoading, editing, setEditing } =
    useMembershipTiersPage();

  return (
    <>
      <ResourceList.Header
        title={t("admin.tiers.page.title")}
        description={t("admin.tiers.page.description")}
      />

      <ResourceList.Toolbar>
        <ResourceList.Search />
      </ResourceList.Toolbar>

      <YearlyDiscountForm
        value={yearlyDiscount}
        loading={yearlyDiscountLoading}
      />

      {rows.length === 0 ? (
        <SectionCard>
          <p className="py-8 text-center text-muted">
            {t("admin.tiers.page.empty")}
          </p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              yearlyDiscount={yearlyDiscount}
              yearlyDiscountLoading={yearlyDiscountLoading}
              onEdit={() => setEditing(tier)}
            />
          ))}
        </div>
      )}

      <ResourceList.Pagination />

      {editing && (
        <TierFormModal
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          tier={editing}
          yearlyDiscount={yearlyDiscount}
        />
      )}
    </>
  );
}
