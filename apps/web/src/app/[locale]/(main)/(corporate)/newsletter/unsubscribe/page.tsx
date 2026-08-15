/** @format */

import type { Metadata } from "next";
import { Suspense } from "react";
import UnsubscribeClient from "./_components/UnsubscribeClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.unsubscribe.page.bultenAboneliginiIptalEtTarodan"),
    description: t(
      "page.unsubscribe.page.tarodanBultenAboneliginiziBuradanIptalEdin",
    ),
    robots: { index: false, follow: false },
  };
}

export default function NewsletterUnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeClient />
    </Suspense>
  );
}
