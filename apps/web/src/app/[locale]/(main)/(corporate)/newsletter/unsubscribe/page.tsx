/** @format */

import type { Metadata } from "next";
import { Suspense } from "react";
import UnsubscribeClient from "./_components/UnsubscribeClient";

export const metadata: Metadata = {
  title: "Bülten Aboneliğini İptal Et · Tarodan",
  description: "Tarodan bülten aboneliğinizi buradan iptal edin.",
  robots: { index: false, follow: false },
};

export default function NewsletterUnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeClient />
    </Suspense>
  );
}
