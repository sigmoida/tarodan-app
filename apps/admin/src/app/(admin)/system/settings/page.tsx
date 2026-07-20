"use client";

import { Button } from "@tarodan/ui";
import { Form, FormInput } from "@tarodan/ui/form";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { PageLoading } from "@/components/PageLoading";
import { AdminTabs } from "@/components/AdminTabs";
import { SectionCard } from "@/components/detail/SectionCard";
import { useSettingsPage } from "./_lib/useSettingsPage";

export default function SettingsPage() {
  const { t, tab, setTab, activeTab, tabs, title, fields, query, form, save } =
    useSettingsPage();

  if (query.isError) {
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
          <Button onClick={() => query.refetch()}>
            {t("common.tryAgain")}
          </Button>
        </div>
      </SectionCard>
    );
  }

  if (query.isLoading || !query.data) return <PageLoading />;

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.settings.page.title")}
        description={t("admin.settings.page.description")}
      />

      <AdminTabs tabs={tabs} value={tab} onChange={setTab} />

      <Form
        form={form}
        onSubmit={(values) => save.mutate({ tab: activeTab, values })}
        className="space-y-6"
      >
        <SectionCard title={title}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {fields.map((f) => (
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
