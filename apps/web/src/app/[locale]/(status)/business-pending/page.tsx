/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { ClockIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useAuthStore } from "@/stores/authStore";
import StatusScreen from "../_components/StatusScreen";

const STEPS = [
  "Ekibimiz şirket bilgileri ve vergi kimlik numaranızı doğrular.",
  "Onaylandığında hesabınız aktif olur ve e-posta ile bilgilendirilirsiniz.",
  "Reddedilmesi durumunda red gerekçesiyle birlikte e-posta alırsınız.",
];

export default function BusinessPendingPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <StatusScreen
      icon={ClockIcon}
      tone="warning"
      title="Başvurunuz İnceleniyor"
      description={
        <>
          <span className="font-semibold text-heading">
            {user?.companyName}
          </span>{" "}
          adına yaptığınız başvuru onay sürecindedir. İnceleme tamamlandığında{" "}
          <span className="font-medium text-heading">{user?.email}</span>{" "}
          adresinize bilgi gönderilecektir (genellikle 1–2 iş günü).
        </>
      }
    >
      <div className="mb-6 rounded-xl border border-warning-200 bg-warning-50 p-4 text-left">
        <p className="mb-2 text-sm font-semibold text-warning-700">
          Onay sürecinde neler olur?
        </p>
        <ol className="space-y-1.5 text-sm text-warning-700 list-decimal list-inside">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-3">
        <ButtonLink href="/contact" className="w-full">
          Destek Ekibiyle İletişime Geç
        </ButtonLink>
        <Button variant="secondary" onClick={handleLogout}>
          Çıkış Yap
        </Button>
      </div>
    </StatusScreen>
  );
}
