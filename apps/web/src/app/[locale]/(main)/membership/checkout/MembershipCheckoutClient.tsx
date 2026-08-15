/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { CreditCardIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Button, Checkbox, Spinner } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { useMembershipCheckout } from "./_hooks/useMembershipCheckout";
import CheckoutOrderSummary from "./_components/CheckoutOrderSummary";
import { useTranslations } from "next-intl";

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <PageShell className="flex items-center justify-center">
      {children}
    </PageShell>
  );
}

export default function MembershipCheckoutClient() {
  const t = useTranslations();
  const {
    period,
    required,
    isPaidTier,
    isAuthenticated,
    authLoading,
    tiersLoading,
    tierInfo,
    agreed,
    setAgreed,
    isProcessing,
    handleSubmit,
  } = useMembershipCheckout();

  const backHref = required ? "/membership?required=true" : "/membership";

  if (authLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) {
    return (
      <CenteredShell>
        <Spinner size="xl" />
      </CenteredShell>
    );
  }
  if (tiersLoading && isPaidTier) {
    return (
      <CenteredShell>
        <Spinner size="xl" />
      </CenteredShell>
    );
  }
  if (!tierInfo) {
    return (
      <CenteredShell>
        <div className="text-center">
          <p className="text-muted mb-4">
            {t("membership.checkout.gecersizUyelikPlani")}
          </p>
          <Link href={backHref} className="text-primary-500 hover:underline">
            {t("membership.checkout.planlaraDon")}
          </Link>
        </div>
      </CenteredShell>
    );
  }

  const priceLabel = tierInfo.price.toLocaleString(
    t("membership.checkout.trTR"),
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );

  return (
    <PageShell>
      <PageHeader
        backHref={backHref}
        backLabel={t("membership.checkout.planlaraDon")}
        title={t("membership.checkout.uyelikYukseltme")}
        description={t(
          "membership.checkout.guvenliOdemeIleUyeliginiziYukseltin",
        )}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Payment */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-4">
          <SectionCard
            title={t("membership.checkout.guvenliOdeme")}
            className="p-6"
          >
            <div className="flex items-center gap-2 text-sm text-muted mb-4">
              <p>
                {t(
                  "membership.checkout.onayladiktanSonraGuvenliOdemeSayfamizdaKart",
                )}
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-5 w-5"
              />
              <span className="text-sm text-muted">
                {t.rich("membership.checkout.termsNotice", {
                  period:
                    period === "yearly"
                      ? t("membership.checkout.yillik")
                      : t("membership.checkout.aylik"),
                  terms: (chunks) => (
                    <Link
                      href="/terms"
                      className="text-primary-500 hover:underline"
                    >
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link
                      href="/privacy"
                      className="text-primary-500 hover:underline"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
          </SectionCard>

          <Button
            variant="primary"
            size="lg"
            type="submit"
            disabled={isProcessing}
            className="w-full gap-2"
          >
            {isProcessing ? (
              <>
                <Spinner
                  size="sm"
                  color="border-surface-elevated border-t-transparent"
                />
                {t("checkout.processing")}
              </>
            ) : (
              <>
                <ShieldCheckIcon className="w-5 h-5" />
                {t("membership.checkout.payAmount", { amount: priceLabel })}
              </>
            )}
          </Button>

          <p className="text-center text-sm text-muted flex items-center justify-center gap-2">
            <ShieldCheckIcon className="w-4 h-4" />
            {t("membership.checkout.sslNotice")}
          </p>
        </form>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <CheckoutOrderSummary tierInfo={tierInfo} period={period} />
        </div>
      </div>
    </PageShell>
  );
}
