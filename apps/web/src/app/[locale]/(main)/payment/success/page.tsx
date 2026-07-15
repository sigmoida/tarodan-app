/** @format */

import { Suspense } from "react";
import PaymentSuccessClient from "./_components/PaymentSuccessClient";

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaymentSuccessClient />
    </Suspense>
  );
}
