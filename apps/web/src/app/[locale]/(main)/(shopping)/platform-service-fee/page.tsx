/** @format */

import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
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
    title: t("information.platformFee.platformHizmetBedeliTarodan"),
    description: t(
      "information.platformFee.tarodanPlatformHizmetBedeliNedirNasil",
    ),
    alternates: localizedCanonical(locale, "/platform-service-fee"),
  };
}

export default async function PlatformHizmetBedeliPage() {
  const t = await getTranslations();
  return (
    <DocPage
      title={t("information.platformFee.platformHizmetBedeli")}
      description={t("information.platformFee.sonGuncelleme2Haziran2026")}
    >
      <SectionCard>
        <div className="prose prose-gray max-w-none">
          <h2>{t("information.platformFee.1Nedir")}</h2>
          <p>
            {t.rich(
              "information.platformFee.platformHizmetBedeliTARODANUzerindenYaptiginiz",
              {
                b: (chunks) => <strong>{chunks}</strong>,
              },
            )}
          </p>

          <h2>{t("information.platformFee.2HesaplamaYontemi")}</h2>
          <ul>
            <li>
              {t.rich("information.platformFee.bBazTutarBSadeceUrun", {
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
            <li>
              {t.rich("information.platformFee.bOranBYururluktekiOran3", {
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
            <li>
              {t.rich("information.platformFee.bKDVBTutaraKDVDahildir", {
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
          </ul>

          <p>
            {t.rich("information.platformFee.ornek500TLLikBirUrun", {
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>

          <h2>{t("information.platformFee.3NereyeGider")}</h2>
          <p>
            {t("information.platformFee.platformHizmetBedeliTARODANAGelir")}
          </p>
          <ul>
            <li>
              {t("information.platformFee.odemeSaglayicisiPayTRIslemKomisyonu")}
            </li>
            <li>
              {t(
                "information.platformFee.sslSertifikasiGuvenlikAltyapisiFraudOnleme",
              )}
            </li>
            <li>
              {t("information.platformFee.musteriDestegiVeUyusmazlikCozumu")}
            </li>
            <li>
              {t("information.platformFee.platformGelistirmeVeTeknikBakim")}
            </li>
          </ul>

          <h2>{t("information.platformFee.4IadeDurumundaNeOlur")}</h2>
          <p>
            {t("information.platformFee.platformHizmetBedeliNinIadeEdilip")}
          </p>
          <ul>
            <li>
              {t.rich("information.platformFee.bSaticiKaynakliIadeBHasarli", {
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
            <li>
              {t.rich("information.platformFee.bSaticiGondermedigiIcinIptalB", {
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
            <li>
              {t.rich(
                "information.platformFee.bAliciFikirDegisikligiSenaryoD",
                {
                  b: (chunks) => <strong>{chunks}</strong>,
                },
              )}
            </li>
            <li>
              {t.rich("information.platformFee.b48SaatOnaySureciDolduktan", {
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
          </ul>

          <h2>{t("information.platformFee.5Seffaflik")}</h2>
          <p>
            {t.rich(
              "information.platformFee.sepetVeCheckoutSayfalarindaPlatformHizmet",
              {
                b: (chunks) => <strong>{chunks}</strong>,
              },
            )}
          </p>

          <h2>{t("information.platformFee.6SorularinizIcin")}</h2>
          <p>
            {t.rich(
              "information.platformFee.platformHizmetBedeliHakkindaDahaFazla",
              {
                link1: (chunks) => (
                  <Link href="/support" className="text-primary-600 underline">
                    {chunks}
                  </Link>
                ),
                link2: (chunks) => (
                  <a
                    href="mailto:destek@tarodan.com.tr"
                    className="text-primary-600 underline"
                  >
                    {chunks}
                  </a>
                ),
              },
            )}
          </p>

          <p className="text-sm text-muted mt-8">
            {t.rich(
              "information.platformFee.buSayfaBilgilendirmeAmaclidirBaglayiciSozlesme",
              {
                link1: (chunks) => (
                  <Link href="/terms" className="text-primary-600 underline">
                    {chunks}
                  </Link>
                ),
                link2: (chunks) => (
                  <Link
                    href="/refund-policy"
                    className="text-primary-600 underline"
                  >
                    {chunks}
                  </Link>
                ),
              },
            )}
          </p>
        </div>
      </SectionCard>
    </DocPage>
  );
}
