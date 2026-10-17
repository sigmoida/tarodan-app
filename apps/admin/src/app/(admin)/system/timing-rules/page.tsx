"use client";

import { Alert, Button } from "@tarodan/ui";
import { Form } from "@tarodan/ui/form";
import { AdminPage } from "@/components/page/AdminPage";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { PageHeader } from "@/components/AdminList";
import { PageLoading } from "@/components/PageLoading";
import { AdminTabs } from "@/components/AdminTabs";
import { SectionCard } from "@/components/detail/SectionCard";
import { legalMismatchesOf } from "./_lib/timing-rules";
import { useTimingRulesPage } from "./_lib/useTimingRulesPage";
import { TimingRuleRow } from "./_components/TimingRuleRow";

/**
 * Süreler ve Kurallar — platformdaki her iş süresi ve süre dolunca ne olacağı.
 * Sekme başına bir grup, satır başına bir süre. Değerler kayıttan
 * (`@tarodan/types` TIMING_RULES) gelen sınırlarla doğrulanır; sunucu aynı
 * kuralları tekrar uygular.
 */
export default function TimingRulesPage() {
  const {
    t,
    canEdit,
    tab,
    setTab,
    tabs,
    errorTabLabels,
    ruleIds,
    states,
    query,
    form,
    save,
    submit,
  } = useTimingRulesPage();

  if (query.isError) {
    return (
      <QueryErrorCard
        title={t("admin.timingRules.error.title")}
        description={t("admin.timingRules.error.description")}
        onRetry={() => void query.refetch()}
        isRetrying={query.isRefetching}
      />
    );
  }

  if (query.isLoading || !query.data) return <PageLoading />;

  const stateOf = (id: string) => states.find((state) => state.id === id);
  // Hukuki metinlerde sabit sayı olarak geçen ve ayarla çelişen süreler.
  const legalConflicts = legalMismatchesOf(states);

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.timingRules.page.title")}
        description={t("admin.timingRules.page.description")}
      />

      {!canEdit && (
        <Alert variant="info">{t("admin.timingRules.readOnly")}</Alert>
      )}

      <AdminTabs tabs={tabs} value={tab} onChange={setTab} />

      {legalConflicts.length > 0 && (
        <Alert variant="warning">
          {t("admin.timingRules.legalMismatchSummary", {
            rules: legalConflicts
              .map(({ id }) => t(`admin.timingRules.rules.${id}.label`))
              .join(", "),
          })}
        </Alert>
      )}

      {errorTabLabels.length > 0 && (
        <Alert variant="danger">
          {t("admin.timingRules.errorsOnTabs", {
            tabs: errorTabLabels.join(", "),
          })}
        </Alert>
      )}

      <Form form={form} onSubmit={submit} className="space-y-6">
        <SectionCard title={t(`admin.timingRules.groups.${tab}`)}>
          {ruleIds.map((id) => (
            <TimingRuleRow
              key={id}
              id={id}
              state={stateOf(id)}
              canEdit={canEdit}
            />
          ))}
        </SectionCard>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" isLoading={save.isPending}>
              {t("admin.timingRules.saveButton")}
            </Button>
          </div>
        )}
      </Form>
    </AdminPage>
  );
}
