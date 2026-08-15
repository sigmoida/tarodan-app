import { Link } from "@/i18n/navigation";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { getTranslations } from "next-intl/server";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";

export default async function BuyerProtectionClient() {
  const t = await getTranslations();

  return (
    <DocPage
      title={t("legal.buyerProtectionTitle")}
      description={`${t("legal.lastUpdated")}: 24 Ocak 2026`}
    >
      <SectionCard>
        <div className="prose prose-gray max-w-none">
          <h2>{t("information.buyerProtection.1AliciKorumaNedir")}</h2>
          <p>
            {t(
              "information.buyerProtection.tarodanAliciKorumaProgramiPlatformUzerinden",
            )}
          </p>

          <h2>{t("information.buyerProtection.2Kapsam")}</h2>
          <ul>
            <li>
              {t(
                "information.buyerProtection.platformdaOdemeAlinanGuvenliOdemeIle",
              )}
            </li>
            <li>
              {t(
                "information.buyerProtection.urunHicKargolanmadiVeyaTakipBilgisi",
              )}
            </li>
            <li>
              {t(
                "information.buyerProtection.urunAciklamayaCiddiSekildeAykiriYanlis",
              )}
            </li>
            <li>
              {t("information.buyerProtection.sahteVeyaTaklitUrunIddiasi")}
            </li>
          </ul>
          <p>
            {t.rich(
              "information.buyerProtection.caymaHakkiVeStandartIadeKosullari",
              {
                link1: (chunks) => (
                  <Link
                    href="/refund-policy"
                    className="inline-flex items-center text-primary-500 hover:underline"
                  >
                    {chunks}
                  </Link>
                ),
                link2: (chunks) => (
                  <Link
                    href="/refund-policy"
                    className="inline-flex items-center text-primary-500 hover:underline"
                  >
                    {chunks}
                  </Link>
                ),
              },
            )}
          </p>

          <h2>
            {t("information.buyerProtection.3ParaIadesiParaIadeGarantisi")}
          </h2>
          <p>
            {t(
              "information.buyerProtection.uygunKosullardaVeIncelemeSonucundaOdeme",
            )}
          </p>

          <h2>{t("information.buyerProtection.4AnlasmazlikCozumu")}</h2>
          <ol>
            <li>
              {t.rich("information.buyerProtection.bSaticiIleIletisimBOnce", {
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
            <li>
              {t.rich(
                "information.buyerProtection.bDestekTalebiBCozulemezseHesabim",
                {
                  b: (chunks) => <strong>{chunks}</strong>,
                },
              )}
            </li>
            <li>
              {t.rich(
                "information.buyerProtection.bIncelemeBDestekEkibimizTalebi",
                {
                  b: (chunks) => <strong>{chunks}</strong>,
                },
              )}
            </li>
            <li>
              {t.rich("information.buyerProtection.bKararVeUygulamaBSonuc", {
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
          </ol>
          <p>
            {t("information.buyerProtection.sureBasvurularGenellikle510Is")}
          </p>

          <h2>{t("information.buyerProtection.5SizinYapmanizGerekenler")}</h2>
          <ul>
            <li>
              {t(
                "information.buyerProtection.siparisiVeVarsaHasarUyumsuzlukFotograflarini",
              )}
            </li>
            <li>
              {t(
                "information.buyerProtection.kargoTakipBilgisiVeIletisimGecmisini",
              )}
            </li>
            <li>
              {t(
                "information.buyerProtection.talepAciklamasiniNetVeDogruYazmak",
              )}
            </li>
            <li>
              {t(
                "information.buyerProtection.platformIletisimlerineZamanindaCevapVermek",
              )}
            </li>
          </ul>

          <h2>{t("information.buyerProtection.6Sinirlamalar")}</h2>
          <p>
            {t(
              "information.buyerProtection.aliciKorumaYasalTuketiciHaklarinizinYerine",
            )}
          </p>

          <h2>{t("information.buyerProtection.7Iletisim")}</h2>
          <p>{t("information.buyerProtection.destekTarodanComTrKonuAlici")}</p>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/refund-policy"
            className="inline-flex items-center text-primary-500 hover:underline"
          >
            {t("legal.refundPolicyTitle")}
            <ChevronRightIcon className="ml-1 h-4 w-4" />
          </Link>
          <Link
            href="/refund-policy"
            className="inline-flex items-center text-primary-500 hover:underline"
          >
            {t("legal.refundPolicy.returnSection")}
            <ChevronRightIcon className="ml-1 h-4 w-4" />
          </Link>
          <Link
            href="/terms"
            className="inline-flex items-center text-primary-500 hover:underline"
          >
            {t("legal.termsTitle")}
            <ChevronRightIcon className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </SectionCard>
    </DocPage>
  );
}
