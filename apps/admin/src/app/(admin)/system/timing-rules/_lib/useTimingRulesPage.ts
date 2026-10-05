"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useZodForm } from "@tarodan/ui/form";
import type { TimingRuleChange } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useTabParam } from "@/hooks/useTabParam";
import { useSession } from "@/context/SessionContext";
import {
  changedRules,
  isTimingGroup,
  readTimingRuleStates,
  rulesInTab,
  tabsWithErrors,
  timingRuleTabs,
  timingRulesSchema,
  toFormValues,
  type TimingRulesFormValues,
} from "./timing-rules";

const RESOURCE = "timing-rules";

async function fetchTimingRules() {
  const response = await adminApi.getTimingRules();
  return readTimingRuleStates(response.data);
}

/**
 * Süreler ve Kurallar sayfasının durumu. Tek form bütün kayıtları taşır;
 * sekme yalnız hangi satırların görüneceğini seçer. Kaydet yalnız DEĞİŞEN
 * kayıtları tek istekte gönderir — sunucu hepsini birlikte doğrular (ilişkili
 * iki alan aynı anda değişebilir) ve her biri için denetim kaydı yazar.
 * Değiştirme yalnız super_admin'e açıktır; diğer roller salt okur.
 */
export function useTimingRulesPage() {
  const t = useTranslations();
  const { user } = useSession();
  const canEdit = user.role === "super_admin";
  const [tab, setTab] = useTabParam("listing");
  const activeTab = isTimingGroup(tab) ? tab : "listing";

  const query = useQuery({
    queryKey: adminKeys.all(RESOURCE),
    queryFn: fetchTimingRules,
  });
  const states = query.data ?? [];

  const form = useZodForm(timingRulesSchema(t, states), {
    values: query.data ? toFormValues(query.data) : undefined,
  });

  const save = useAdminMutation(
    (changes: TimingRuleChange[]) => adminApi.updateTimingRules(changes),
    {
      invalidates: [RESOURCE],
      successMessage: t("admin.timingRules.saved"),
    },
  );

  const submit = (values: TimingRulesFormValues) => {
    const changes = changedRules(values, states);
    if (changes.length > 0) save.mutate(changes);
  };

  // Gizli sekmedeki bir hata Kaydet'i sessizce durdurmasın: hatalı sekmeler
  // sekme çubuğunda işaretlenir ve sayfada adlarıyla listelenir.
  const errorTabs = tabsWithErrors(form.formState.errors);
  const tabs = timingRuleTabs(t).map((item) =>
    errorTabs.includes(item.key) ? { ...item, badge: "!" } : item,
  );
  const errorTabLabels = tabs
    .filter((item) => errorTabs.includes(item.key))
    .map((item) => item.label);

  return {
    t,
    canEdit,
    tab: activeTab,
    setTab,
    tabs,
    errorTabLabels,
    ruleIds: rulesInTab(activeTab),
    states,
    query,
    form,
    save,
    submit,
  };
}
