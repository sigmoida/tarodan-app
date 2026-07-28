"use client";

import { useTranslations } from "next-intl";
import { ResourceList } from "@/components/list";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { SectionCard } from "@/components/detail/SectionCard";
import { TierCard } from "./_components/TierCard";
import { YearlyDiscountForm } from "./_components/YearlyDiscountForm";
import { TierFormModal } from "./_modals/TierFormModal";
import { type MembershipTier } from "./_lib/types";
import { useSession } from "@/context/SessionContext";
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
  const { user } = useSession();
  const canEdit = user.role === "super_admin";
  const {
    rows,
    yearlyDiscount,
    yearlyDiscountLoading,
    yearlyDiscountError,
    yearlyDiscountRetrying,
    retryYearlyDiscount,
    editing,
    setEditing,
  } = useMembershipTiersPage();

  const header = (
    <ResourceList.Header
      title={t("admin.tiers.page.title")}
      description={t("admin.tiers.page.description")}
    />
  );

  if (yearlyDiscountError) {
    return (
      <>
        {header}
        <QueryErrorCard
          onRetry={() => void retryYearlyDiscount()}
          isRetrying={yearlyDiscountRetrying}
        />
      </>
    );
  }

  return (
    <>
      {header}

      <ResourceList.Toolbar>
        <ResourceList.Search />
      </ResourceList.Toolbar>

      {canEdit && (
        <YearlyDiscountForm
          value={yearlyDiscount}
          loading={yearlyDiscountLoading}
        />
      )}

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
              onEdit={canEdit ? () => setEditing(tier) : undefined}
            />
          ))}
        </div>
      )}

      <ResourceList.Pagination />

      {canEdit && editing && (
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
