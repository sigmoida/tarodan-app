/** @format */

"use client";

import { useRouter } from "next/navigation";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useAuthStore } from "@/stores/authStore";
import StatusScreen from "../_components/StatusScreen";

export default function BusinessRejectedPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <StatusScreen
      icon={XCircleIcon}
      tone="danger"
      title="Başvurunuz Reddedildi"
      description={
        <>
          <span className="font-semibold text-heading">
            {user?.companyName}
          </span>{" "}
          adına yaptığınız şirket hesabı başvurusu onaylanmadı. Red gerekçesi{" "}
          <span className="font-medium text-heading">{user?.email}</span>{" "}
          adresinize e-posta ile gönderilmiştir.
        </>
      }
    >
      <div className="mb-6 rounded-xl border border-danger-200 bg-danger-50 p-4 text-left">
        <p className="text-sm text-danger-700">
          Başvurunuzun hatalı reddedildiğini veya eksik bilgi olduğunu
          düşünüyorsanız destek ekibiyle iletişime geçebilirsiniz.
        </p>
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
