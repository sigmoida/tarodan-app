/** @format */

import type { Metadata } from "next";
import { Suspense } from "react";
import MembershipSuccessClient from "./MembershipSuccessClient";

export const metadata: Metadata = {
  title: "Üyelik Güncellendi | Tarodan",
  robots: { index: false, follow: false },
};

export default function MembershipSuccessPage() {
  return (
    <Suspense fallback={null}>
      <MembershipSuccessClient />
    </Suspense>
  );
}
