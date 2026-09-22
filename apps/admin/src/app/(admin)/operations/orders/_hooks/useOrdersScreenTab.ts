"use client";

import { useMemo } from "react";
import {
  ADMIN_ORDERS_DEFAULT_SCREEN_TAB,
  allowedAdminOrdersScreenTabs,
  resolveAdminOrdersScreenTab,
  type AdminOrdersScreenTab,
} from "@tarodan/types";
import { useTabParam } from "@/hooks/useTabParam";
import { usePermissions } from "@/context/PermissionsContext";
import { ORDERS_TAB_SCOPED_PARAMS } from "../_lib/screenTabs";

// Module-level so `setTab` keeps its identity across renders.
const TAB_OPTIONS = { clearOnChange: ORDERS_TAB_SCOPED_PARAMS } as const;

/**
 * Üst sekme (`?tab=`) — kullanıcının izinli sekmeleriyle. Yetkisi olmayan
 * sekme gizlidir; URL'de yetkisiz / tanınmayan sekme izinli ilk sekmeye düşer
 * (yalnız takas yetkili kullanıcı doğrudan Takaslar'da açılır). Sekme
 * değişince önceki sekmenin filtreleri, alt sekmesi ve sayfası silinir;
 * deep-link kapsamı (`userId`, `productId`…) kalır.
 */
export function useOrdersScreenTab(): {
  tab: AdminOrdersScreenTab;
  tabs: AdminOrdersScreenTab[];
  setTab: (key: string) => void;
} {
  const { can } = usePermissions();
  const tabs = useMemo(() => allowedAdminOrdersScreenTabs(can), [can]);
  const [rawTab, setTab] = useTabParam(
    ADMIN_ORDERS_DEFAULT_SCREEN_TAB,
    TAB_OPTIONS,
  );
  return { tab: resolveAdminOrdersScreenTab(rawTab, tabs), tabs, setTab };
}
