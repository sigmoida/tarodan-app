"use client";

import { useTranslations } from "next-intl";
import { useTabParam } from "@/hooks/useTabParam";
import { getRoleTabs } from "./constants";

export function useRolesPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("matrix");

  return {
    t,
    tab,
    setTab,
    tabs: getRoleTabs(t),
    showMatrix: () => setTab("matrix"),
  };
}
