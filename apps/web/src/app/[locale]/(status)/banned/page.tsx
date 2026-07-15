"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NoSymbolIcon } from "@heroicons/react/24/solid";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useAuthStore } from "@/stores/authStore";
import StatusScreen from "../_components/StatusScreen";

function BannedContent() {
  const router = useRouter();
  const reason = useSearchParams().get("reason");
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <StatusScreen
      icon={NoSymbolIcon}
      tone="danger"
      title="Hesabınız Askıya Alındı"
      description="Hesabınız kural ihlali nedeniyle banlanmıştır. Bunun bir hata olduğunu düşünüyorsanız destek ekibiyle iletişime geçebilirsiniz."
    >
      {reason && (
        <div className="mb-6 rounded-xl border border-danger-200 bg-danger-50 p-4 text-left">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger-600">
            Ban sebebi
          </p>
          <p className="text-sm text-heading">{reason}</p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <ButtonLink variant="primary" href="/contact" className="w-full">
          Destek Ekibiyle İletişime Geç
        </ButtonLink>
        <Button variant="secondary" onClick={handleLogout} className="w-full">
          Çıkış Yap
        </Button>
      </div>
    </StatusScreen>
  );
}

export default function BannedPage() {
  return (
    <Suspense>
      <BannedContent />
    </Suspense>
  );
}
