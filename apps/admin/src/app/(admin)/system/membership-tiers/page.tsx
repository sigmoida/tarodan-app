"use client";

import { useTranslations } from "next-intl";
import { Alert, Button } from "@tarodan/ui";
import { ResourceList } from "@/components/list";
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

  // Yıllık indirim, tarife listesinden AYRI bir uçtan (ve ayrı bir izinden)
  // gelir. Eskiden bu ikincil sorgunun hatası tüm sayfayı QueryErrorCard'a
  // çeviriyordu: `membership_tiers` izni olup `settings` olmayan bir rol için
  // tarife listesi hiç görünmüyordu. Artık liste her durumda render edilir;
  // yalnız indirimden TÜRETİLEN değerler ve düzenleme devre dışı kalır.
  const discountReady = yearlyDiscount != null;

  return (
    <>
      <ResourceList.Header
        title={t("admin.tiers.page.title")}
        description={t("admin.tiers.page.description")}
      />

      <ResourceList.Toolbar>
        <ResourceList.Search />
      </ResourceList.Toolbar>

      {yearlyDiscountError && (
        <Alert variant="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("admin.tiers.page.discountLoadError")}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void retryYearlyDiscount()}
              isLoading={yearlyDiscountRetrying}
            >
              {t("admin.shared.suspense.retry")}
            </Button>
          </div>
        </Alert>
      )}

      {canEdit && discountReady && (
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
              // Düzenleme, indirim oranı bilinmeden AÇILMAZ: modal yıllık
              // fiyatı bu orandan hesaplayıp kaydediyor.
              onEdit={
                canEdit && discountReady ? () => setEditing(tier) : undefined
              }
            />
          ))}
        </div>
      )}

      <ResourceList.Pagination />

      {canEdit && editing && discountReady && (
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
