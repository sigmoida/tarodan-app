"use client";

import { type ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowsRightLeftIcon,
  CheckBadgeIcon,
  QueueListIcon,
  ShoppingCartIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import {
  ADMIN_ORDERS_SCREEN_TAB_I18N_KEYS,
  type AdminOrdersScreenTab,
} from "@tarodan/types";
import { AdminTabs } from "@/components/AdminTabs";
import { useOrdersScreenTab } from "../_hooks/useOrdersScreenTab";
import { useOrdersScreenBadges } from "../_hooks/useOrdersScreenBadges";

const TAB_ICONS: Record<
  AdminOrdersScreenTab,
  ComponentType<{ className?: string }>
> = {
  all: QueueListIcon,
  direct_sale: ShoppingCartIcon,
  offers: TagIcon,
  offer_order: CheckBadgeIcon,
  trades: ArrowsRightLeftIcon,
};

const PENDING = "…";

/**
 * Üst sekme çubuğu (Tüm Siparişler / Direkt Satış / Teklifler / Siparişe
 * Dönen Teklifler / Takaslar) — yalnız kullanıcının izinli sekmeleri. Her
 * sekmenin görünümü kendi listesini kurar; çubuk o listenin bağlamı içinde
 * render edilir ki etkin sekmenin rozeti listenin filtrelerini yansıtsın.
 */
export function OrdersScreenTabBar() {
  const t = useTranslations();
  const { tab, tabs, setTab } = useOrdersScreenTab();
  const badges = useOrdersScreenBadges(tab);

  return (
    <AdminTabs
      tabs={tabs.map((key) => ({
        key,
        label: t(ADMIN_ORDERS_SCREEN_TAB_I18N_KEYS[key]),
        icon: TAB_ICONS[key],
        badge: badges[key] ?? PENDING,
      }))}
      value={tab}
      onChange={setTab}
    />
  );
}
