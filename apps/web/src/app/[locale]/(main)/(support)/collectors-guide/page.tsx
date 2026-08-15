/** @format */

import type { Metadata } from "next";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { localizedCanonical } from "@/lib/seo";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("information.collectorsGuide.koleksiyonerRehberiTarodan"),
    description: t(
      "information.collectorsGuide.koleksiyonunuzuTarodanDaSergilemePaylasmaTakas",
    ),
    alternates: localizedCanonical(locale, "/collectors-guide"),
  };
}

export default async function CollectorsGuidePage() {
  const t = await getTranslations();
  return (
    <DocPage
      title={t("information.collectorsGuide.koleksiyonerRehberi")}
      description={t(
        "information.collectorsGuide.koleksiyonunuDunyayaAcDigerKoleksiyonerlerlePaylas",
      )}
    >
      <SectionCard title={t("information.collectorsGuide.koleksiyonum")}>
        <div className="space-y-4 text-sm leading-relaxed text-body">
          <p className="text-base font-semibold text-heading">
            {t("information.collectorsGuide.koleksiyonunuDunyayaAc")}
          </p>
          <p>{t("information.collectorsGuide.herModelinBirHikYesiHer")}</p>
          <p>
            {t(
              "information.collectorsGuide.koleksiyonumSanaKendiDijitalVitrininiOlusturma",
            )}
          </p>
          <p>
            {t(
              "information.collectorsGuide.birParcaniSadeceSergilemekIsteyebilirsinYa",
            )}
          </p>
          <p>
            {t(
              "information.collectorsGuide.koleksiyonunuKategorilereAyirEnDegerliParcalarini",
            )}
          </p>
          <p>
            {t(
              "information.collectorsGuide.tarodanAposDaKoleksiyonlarSadeceSergilenmez",
            )}
          </p>
          <p className="font-semibold text-heading">
            {t(
              "information.collectorsGuide.sergilePaylasTakasEtSatKoleksiyonunu",
            )}
          </p>
        </div>
      </SectionCard>
    </DocPage>
  );
}
