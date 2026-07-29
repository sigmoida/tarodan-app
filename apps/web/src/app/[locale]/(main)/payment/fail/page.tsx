/** @format */

import { Suspense } from "react";
import PaymentFailClient from "./_components/PaymentFailClient";

export default function PaymentFailPage() {
  return (
    <Suspense fallback={null}>
      <PaymentFailClient />
    </Suspense>
  );
}
