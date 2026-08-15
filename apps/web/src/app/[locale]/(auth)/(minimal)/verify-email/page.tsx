import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Spinner } from "@tarodan/ui/spinner";
import { VerifyEmailForm } from "../../_components/VerifyEmailForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.verifyEmail.page.ePostaDogrulamaTarodan"),
    description: t(
      "page.verifyEmail.page.tarodanHesabinizinEPostaAdresiniDogrulayin",
    ),
    robots: { index: false, follow: false },
  };
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-10">
          <Spinner variant="svg" size="lg" className="text-primary-600" />
        </div>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}
