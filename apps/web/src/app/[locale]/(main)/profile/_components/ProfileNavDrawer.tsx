/** @format */

"use client";

import { useTranslations } from "next-intl";
import MobileDrawer from "@/components/layout/MobileDrawer";
import { useMobileNavStore } from "@/stores/mobileNavStore";
import ProfileSidebar from "./ProfileSidebar";

/**
 * `/profile/*` yollarında hamburger'ın açtığı çekmece. İçeriği masaüstündeki
 * kenar çubuğunun TA KENDİSİ — aynı bölümler, aynı rozetler, aynı aktif satır;
 * ayrı bir mobil menü yazmak iki listenin zamanla ayrışması demekti.
 *
 * Burada durur çünkü `ProfileSidebar` `ProfileProvider`'a bağlı ve o sağlayıcı
 * `Header`'ın altında; Header yalnız hamburger düğmesini taşır.
 */
export default function ProfileNavDrawer() {
  const t = useTranslations();
  const { isOpen, close } = useMobileNavStore();

  return (
    <MobileDrawer isOpen={isOpen} onClose={close} title={t("nav.account")}>
      <ProfileSidebar className="rounded-none border-0" onNavigate={close} />
    </MobileDrawer>
  );
}
