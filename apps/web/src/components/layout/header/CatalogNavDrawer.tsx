/** @format */

"use client";

import { useTranslations } from "next-intl";
import MobileDrawer from "../MobileDrawer";
import { useMobileNavStore } from "@/stores/mobileNavStore";
import MobileCatalogNav from "./nav/MobileCatalogNav";

/**
 * Katalog yollarında hamburger'ın açtığı çekmece — kategori barının küçük ekran
 * karşılığı. `Header` yalnız bu yollarda bağlar, çünkü kategori barı da yalnız
 * orada görünür.
 */
export default function CatalogNavDrawer() {
  const t = useTranslations();
  const { isOpen, close } = useMobileNavStore();

  return (
    <MobileDrawer isOpen={isOpen} onClose={close} title={t("nav.menu")}>
      <MobileCatalogNav onNavigate={close} />
    </MobileDrawer>
  );
}
