"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { PageLoading } from "@/components/PageLoading";
import { AdminTabs } from "@/components/AdminTabs";
import { SectionCard } from "@/components/detail/SectionCard";
import { useTabParam } from "@/hooks/useTabParam";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  type SettingsTab,
  type SettingsFormValues,
  settingsTabs,
  tabTitle,
  tabFields,
  settingsSchema,
  parseSettings,
  toFormValues,
} from "./_lib/settings";

export default function SettingsPage() {
  const t = useTranslations();
  const [tab, setTab] = useTabParam("listing");
  const activeTab = tab as SettingsTab;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const res = await adminApi.getSettings();
      return parseSettings(res.data?.data ?? res.data ?? []);
    },
  });

  // `values` reactively reseeds the form from the query (and after each save's
  // refetch) — no useEffect state mirror. All fields are seeded, so whole-form
  // validation on submit never trips on a tab the user hasn't touched.
  const form = useZodForm(settingsSchema(t), {
    values: data ? toFormValues(data) : undefined,
  });

  const save = useAdminMutation(
    (v: { tab: SettingsTab; values: SettingsFormValues }) =>
      Promise.all(
        tabFields(t)[v.tab].map((f) =>
          adminApi.updateSetting(f.backendKey, String(Number(v.values[f.key]))),
        ),
      ),
    {
      invalidates: ["platform-settings"],
      successMessage: t("admin.settings.saved"),
    },
  );

  if (isLoading || !data) {
    return <PageLoading />;
  }

  if (isError) {
    return (
      <SectionCard>
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <ExclamationTriangleIcon className="h-12 w-12 shrink-0 text-danger-500" />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-heading">
              {t("admin.settings.error.title")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t("admin.settings.error.description")}
            </p>
          </div>
          <Button onClick={() => refetch()}>{t("common.tryAgain")}</Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.settings.page.title")}
        description={t("admin.settings.page.description")}
      />

      <AdminTabs tabs={settingsTabs(t)} value={tab} onChange={setTab} />

      <Form
        form={form}
        onSubmit={(values) => save.mutate({ tab: activeTab, values })}
        className="space-y-6"
      >
        <SectionCard title={tabTitle(t)[activeTab]}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {tabFields(t)[activeTab].map((f) => (
              <FormInput
                key={f.key}
                name={f.key}
                type="number"
                label={f.label}
                helperText={f.helper}
                min={f.min}
                step={f.step}
              />
            ))}
          </div>
        </SectionCard>

        <div className="flex justify-end">
          <Button type="submit" isLoading={save.isPending}>
            {t("admin.settings.saveButton")}
          </Button>
        </div>
      </Form>
    </AdminPage>
  );
}
