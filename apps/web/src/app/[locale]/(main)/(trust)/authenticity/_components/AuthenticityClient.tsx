import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";

export default async function AuthenticityClient() {
  const t = await getTranslations();

  return (
    <DocPage
      title={t("information.authenticity.title")}
      description={t("information.authenticity.subtitle")}
    >
      <SectionCard>
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-heading">
              {t("information.authenticity.process")}
            </h2>
            <p className="text-body">
              {t("information.authenticity.processDesc")}
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-heading">
              {t("information.authenticity.protection")}
            </h2>
            <p className="text-body">
              {t("information.authenticity.protectionDesc")}
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-heading">
              {t("information.authenticity.badges")}
            </h2>
            <p className="text-body">
              {t("information.authenticity.badgesDesc")}
            </p>
          </section>
        </div>
      </SectionCard>
    </DocPage>
  );
}
