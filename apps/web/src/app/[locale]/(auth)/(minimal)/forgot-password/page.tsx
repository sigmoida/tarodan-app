import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "../../_components/ForgotPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.forgotPassword.page.sifremiUnuttumTarodan"),
    description: t("page.forgotPassword.page.tarodanHesapSifreniziSifirlayin"),
    robots: { index: false, follow: false },
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
