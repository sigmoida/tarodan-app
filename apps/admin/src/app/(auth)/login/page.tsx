import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: `${t("admin.auth.login.pageTitleWord")} - ${APP_NAME}`,
    description: t("admin.auth.login.pageDescription"),
  };
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: {
    redirect?: string | string[];
    expired?: string | string[];
  };
}) {
  const redirectTo = Array.isArray(searchParams?.redirect)
    ? searchParams.redirect[0]
    : searchParams?.redirect;
  const expiredReason = Array.isArray(searchParams?.expired)
    ? searchParams.expired[0]
    : searchParams?.expired;

  return <LoginForm redirectTo={redirectTo} expiredReason={expiredReason} />;
}
