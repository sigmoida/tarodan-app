"use client";

import { Link } from "@/i18n/navigation";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useLocale, useTranslations } from "next-intl";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";

export default function ShippingDeliveryClient() {
  const t = useTranslations();

  return (
    <DocPage
      title={t("information.shipping.title")}
      description={t("information.shipping.subtitle")}
    >
      <SectionCard>
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-heading">
              {t("information.shipping.methods")}
            </h2>
            <p className="text-body">{t("information.shipping.methodsDesc")}</p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-heading">
              {t("information.shipping.costs")}
            </h2>
            <p className="text-body">{t("information.shipping.costsDesc")}</p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-heading">
              {t("information.shipping.times")}
            </h2>
            <p className="text-body">{t("information.shipping.timesDesc")}</p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-heading">
              {t("information.shipping.tracking")}
            </h2>
            <p className="mb-3 text-body">
              {t("information.shipping.trackingDesc")}
            </p>
            <Link
              href="/track-order"
              className="inline-flex items-center gap-2 font-medium text-primary-600 hover:text-primary-700"
            >
              {t("information.shipping.trackLink")}
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </section>
        </div>
      </SectionCard>
    </DocPage>
  );
}
