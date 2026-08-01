"use client";

import { Button } from "@tarodan/ui";
import { Form, FormInput } from "@tarodan/ui/form";
import { AdminPage } from "@/components/page/AdminPage";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { PageHeader } from "@/components/AdminList";
import { PageLoading } from "@/components/PageLoading";
import { AdminTabs } from "@/components/AdminTabs";
import { SectionCard } from "@/components/detail/SectionCard";
import { useSettingsPage } from "./_lib/useSettingsPage";
import { SearchReindexButton } from "./_components/SearchReindexButton";
import { WarehouseAddressCard } from "./_components/WarehouseAddressCard";

export default function SettingsPage() {
  const {
    t,
    tab,
    setTab,
    activeTab,
    isWarehouseTab,
    tabs,
    title,
    fields,
    query,
    form,
    save,
  } = useSettingsPage();

  if (query.isError) {
    return (
      <QueryErrorCard
        title={t("admin.settings.error.title")}
        description={t("admin.settings.error.description")}
        onRetry={() => void query.refetch()}
        isRetrying={query.isRefetching}
      />
    );
  }

  if (query.isLoading || !query.data) return <PageLoading />;

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.settings.page.title")}
        description={t("admin.settings.page.description")}
      >
        <SearchReindexButton />
      </PageHeader>

      <AdminTabs tabs={tabs} value={tab} onChange={setTab} />

      {isWarehouseTab ? (
        <WarehouseAddressCard />
      ) : (
        <>
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
                    placeholder="0"
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
        </>
      )}
    </AdminPage>
  );
}
