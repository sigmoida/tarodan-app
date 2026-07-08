"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { XMarkIcon, InformationCircleIcon } from "@heroicons/react/24/outline";

/**
 * Faz 5.4 — Platform Hizmet Bedeli aktivasyon duyuru banner'ı.
 *
 * Aktivasyon tarihinden itibaren 14 gün boyunca kullanıcıya gösterilir.
 * localStorage flag ile kullanıcı kapattığında bir daha gösterilmez.
 *
 * Aktivasyon tarihi: 2026-06-03. Banner sona erme: 2026-06-17.
 */
const STORAGE_KEY = "platform-fee-banner-dismissed";
const ANNOUNCEMENT_END_DATE = new Date("2026-06-17T23:59:59Z");

export function PlatformFeeAnnouncementBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Date.now() > ANNOUNCEMENT_END_DATE.getTime()) return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  const handleDismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="bg-info-50 border-b border-info-200 px-4 py-3 text-info-900"
      role="banner"
      aria-label="Platform Hizmet Bedeli duyurusu"
    >
      <div className="max-w-7xl mx-auto flex items-start gap-3">
        <InformationCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <strong>Bilgi:</strong> 2 Haziran 2026 itibarıyla TARODAN'da yapılan
          satın almalardan ürün bedelinin <strong>%3'ü oranında</strong>{" "}
          Platform Hizmet Bedeli alınmaya başlanmıştır.{" "}
          <Link
            href="/platform-service-fee"
            className="underline hover:text-info-700 font-medium"
          >
            Detaylı bilgi
          </Link>
          .
        </div>
        <button
          onClick={handleDismiss}
          className="text-info-700 hover:text-info-900 flex-shrink-0"
          aria-label="Banner'ı kapat"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
