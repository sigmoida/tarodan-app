/** @format */

"use client";

import { Bars3Icon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useMobileNavStore } from "@/stores/mobileNavStore";

/**
 * Logonun solundaki hamburger. Yalnız `lg` altında görünür; hangi gezinmeyi
 * açacağına karar vermez — durumu paylaşılan store'a yazar, o yolda hangi
 * çekmece bağlıysa o açılır.
 */
export default function HeaderMenuButton() {
  const t = useTranslations();
  const { isOpen, toggle } = useMobileNavStore();

  return (
    <Button
      variant="nav"
      size="icon"
      onClick={toggle}
      aria-label={t("nav.menu")}
      aria-expanded={isOpen}
      className="h-9 w-9 rounded-md lg:hidden"
    >
      <Bars3Icon className="h-6 w-6" />
    </Button>
  );
}
