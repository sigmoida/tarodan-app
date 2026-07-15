import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@tarodan/ui/spinner";
import { VerifyEmailForm } from "../../_components/VerifyEmailForm";

export const metadata: Metadata = {
  title: "E-posta Doğrulama · Tarodan",
  description: "Tarodan hesabınızın e-posta adresini doğrulayın",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-10">
          <Spinner variant="svg" size="lg" className="text-primary-600" />
        </div>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}
