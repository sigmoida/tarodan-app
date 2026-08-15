"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";

export default function IntellectualPropertyClient() {
  const t = useTranslations();

  return (
    <DocPage
      title={t("legal.intellectualPropertyTitle")}
      description={`${t("legal.lastUpdated")}: 24 Ocak 2026`}
    >
      <SectionCard>
        <div className="prose prose-gray max-w-none">
          <h2>{t("legal.intellectualProperty.1GenelIlke")}</h2>
          <p>
            {t(
              "legal.intellectualProperty.tarodanUcuncuKisilerinTelifHakkiMarka",
            )}
          </p>

          <h2>{t("legal.intellectualProperty.2PlatformunFikriMulkiyeti")}</h2>
          <p>
            {t(
              "legal.intellectualProperty.tarodanAdiLogosuArayuzTasarimiMetinleri",
            )}
          </p>

          <h2>
            {t("legal.intellectualProperty.3KullaniciVeSaticiIcerikleri")}
          </h2>
          <p>
            {t(
              "legal.intellectualProperty.kullanicilarVeSaticilarYukledikleriMetinVe",
            )}
          </p>

          <h2>
            {t("legal.intellectualProperty.4TelifHakkiIhlaliBildirimiDMCA")}
          </h2>
          <p>
            {t(
              "legal.intellectualProperty.telifHakkiIhlaliOldugunuDusundugunuzBir",
            )}
          </p>
          <ul>
            <li>
              {t(
                "legal.intellectualProperty.ihlalEdildiginiIddiaEttiginizEserinTanimi",
              )}
            </li>
            <li>
              {t(
                "legal.intellectualProperty.platformdakiIhlalIcerigininKonumuIlanSayfasindaki",
              )}
            </li>
            <li>
              {t(
                "legal.intellectualProperty.iletisimBilgilerinizAdEPostaTelefon",
              )}
            </li>
            <li>
              {t(
                "legal.intellectualProperty.iceriginIzninizOlmadanKullanildiginaDairIyi",
              )}
            </li>
            <li>
              {t(
                "legal.intellectualProperty.beyanlarinizinDogrulugunaDairYanlisBilgiVerme",
              )}
            </li>
          </ul>
          <p>
            {t.rich("legal.intellectualProperty.bBildirimAdresiBLegalTarodan", {
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>

          <h2>{t("legal.intellectualProperty.5MarkaKullanimi")}</h2>
          <p>
            {t(
              "legal.intellectualProperty.urunIlanlarindaMarkaIsimleriOrijinalUrunu",
            )}
          </p>

          <h2>{t("legal.intellectualProperty.6TekrarlayanIhlalciler")}</h2>
          <p>
            {t(
              "legal.intellectualProperty.gecerliIhlalBildirimleriSonrasindaTekrarlayanIhlal",
            )}
          </p>

          <h2>{t("legal.intellectualProperty.7Iletisim")}</h2>
          <p>
            {t(
              "legal.intellectualProperty.fikriMulkiyetVeIhlalBildirimleriLegal",
            )}
          </p>
        </div>
      </SectionCard>

      <div className="flex flex-wrap gap-4">
        <Link href="/terms" className="text-primary-500 hover:underline">
          {t("legal.intellectualProperty.kullanimSartlari")}
        </Link>
        <Link
          href="/seller-agreement"
          className="text-primary-500 hover:underline"
        >
          {t("legal.intellectualProperty.saticiSozlesmesi")}
        </Link>
      </div>
    </DocPage>
  );
}
