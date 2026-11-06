import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";

/**
 * The payment options information page (a Server Component: no interaction).
 * The installment paragraph follows the switch (plan 6.6): with it off the
 * neutral text says card payments are single payments; with it on, where the
 * options are shown.
 */
export default async function PaymentOptionsContent({
  installmentsEnabled,
}: {
  installmentsEnabled: boolean;
}) {
  const t = await getTranslations();

  return (
    <DocPage
      title={t("information.paymentOptions.title")}
      description={t("information.paymentOptions.subtitle")}
    >
      <SectionCard>
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-heading">
              {t("information.paymentOptions.accepted")}
            </h2>
            <p className="text-body">
              {t("information.paymentOptions.acceptedDesc")}
            </p>
          </section>
          <section>
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-success-600" />
              <h2 className="text-lg font-semibold text-heading">
                {t("information.paymentOptions.security")}
              </h2>
            </div>
            <p className="text-body">
              {t("information.paymentOptions.securityDesc")}
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-heading">
              {t("information.paymentOptions.installments")}
            </h2>
            <p className="text-body">
              {installmentsEnabled
                ? t("information.paymentOptions.installmentsDescEnabled")
                : t("information.paymentOptions.installmentsDesc")}
            </p>
          </section>
        </div>
      </SectionCard>
    </DocPage>
  );
}
