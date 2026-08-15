import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RegisterBusinessForm } from "../../../_components/RegisterBusinessForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.business.page.sirketHesabiKaydiTarodan"),
    description: t("page.business.page.tarodanSirketHesabiniziOlusturun"),
    robots: { index: false, follow: false },
  };
}

export default function BusinessRegisterPage() {
  return <RegisterBusinessForm />;
}
