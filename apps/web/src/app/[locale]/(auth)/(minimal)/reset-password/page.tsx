import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ResetPasswordForm } from "../../_components/ResetPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.resetPassword.page.sifreSifirlaTarodan"),
    description: t(
      "page.resetPassword.page.yeniTarodanHesapSifreniziOlusturun",
    ),
    robots: { index: false, follow: false },
  };
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
