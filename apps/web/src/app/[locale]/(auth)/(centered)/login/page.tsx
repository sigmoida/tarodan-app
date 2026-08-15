import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "../../_components/LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.login.page.girisYapTarodan"),
    description: t("page.login.page.tarodanHesabinizaGirisYapin"),
    robots: { index: false, follow: false },
  };
}

export default function LoginPage() {
  return <LoginForm />;
}
