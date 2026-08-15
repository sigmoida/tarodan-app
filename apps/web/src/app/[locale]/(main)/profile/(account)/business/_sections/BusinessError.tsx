/** @format */

import { Link } from "@/i18n/navigation";
import { Button } from "@tarodan/ui";
import { EmptyStateCard } from "@/components/ui";
import { getTranslations } from "next-intl/server";

/**
 * Backend hints that the company name is missing → send the user to /profile;
 * otherwise the account simply isn't a business tier → send them to /pricing.
 *
 * Aşağıdaki Türkçe parçalar API'nin ürettiği HATA METNİDİR, ekrana basılan kopya
 * değildir; bu yüzden katalogda değil, eşleşme deseni olarak burada durur.
 */
function needsCompanyName(error: string): boolean {
  /* eslint-disable @tarodan/no-hardcoded-turkish -- backend error match patterns, not display copy */
  return (
    error.includes("Şirket adı") ||
    error.includes("companyName") ||
    error.includes("şirket adı")
  );
  /* eslint-enable @tarodan/no-hardcoded-turkish */
}

export default async function BusinessError({ error }: { error: string }) {
  const t = await getTranslations();
  const companyNameHint = needsCompanyName(error);

  return (
    <EmptyStateCard
      title={error}
      action={
        companyNameHint ? (
          <Button asChild>
            <Link href="/profile">
              {t("profile.businessError.sirketAdiEkle")}
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/membership">
              {t("profile.businessError.uyeligimiYukselt")}
            </Link>
          </Button>
        )
      }
    />
  );
}
