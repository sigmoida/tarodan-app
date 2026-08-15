import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RegisterForm } from "../../_components/RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.register.page.kayitOlTarodan"),
    description: t(
      "page.register.page.tarodanKoleksiyonerToplulugunaUcretsizUyeOlun",
    ),
    robots: { index: false, follow: false },
  };
}

export default function RegisterPage() {
  return <RegisterForm />;
}
