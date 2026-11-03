"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Select } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { col } from "@/components/table";
import { goldenRows, type GoldenRow } from "../_lib/goldenRows";
import {
  EMPTY_SCENARIO,
  SCENARIO_FIELDS,
  SCENARIO_LABEL_KEY,
  goldenName,
  inputsToForm,
  scenarioSchema,
  validInputs,
  type ScenarioFormValues,
} from "../_lib/scenarioForm";
import type { CandidateParams } from "../_lib/useCandidateParams";
import { useLabScenario, useLabScenarios } from "../_lib/useSellerTrustLab";
import { ExplainPanel } from "./ExplainPanel";
import { LabError, LabLoading } from "./LabResultState";

const C = "admin.system.sellerTrustLab";
const NOT_SORTABLE = { sortable: false } as const;

/**
 * Try the score with hypothetical inputs: no seller, no stored data. The ten
 * approved reference scenarios are presets and are listed with their approved
 * v1 result. A valid, changed candidate is applied alongside v1.
 */
export function ScenarioCard({ candidate }: { candidate: CandidateParams }) {
  const t = useTranslations();
  const form = useZodForm(scenarioSchema(t), {
    defaultValues: EMPTY_SCENARIO,
    mode: "onChange",
  });
  const presets = useLabScenarios();
  const { query, submit, clear } = useLabScenario();

  const run = (values: ScenarioFormValues) => {
    const inputs = validInputs(values);
    if (!inputs) return;
    submit({
      inputs,
      ...(candidate.params && candidate.modified
        ? { params: candidate.params }
        : {}),
    });
  };

  const onPreset = (key: string) => {
    const preset = presets.data?.find((p) => p.key === key);
    if (!preset) return;
    form.reset(inputsToForm(preset.inputs));
    clear();
  };

  const columns = useMemo(
    () => [
      col.text<GoldenRow>(
        t(`${C}.golden.colName`),
        (r) => r.name,
        NOT_SORTABLE,
      ),
      col.text<GoldenRow>(
        t(`${C}.golden.colScore`),
        (r) => r.score,
        NOT_SORTABLE,
      ),
      col.text<GoldenRow>(
        t(`${C}.golden.colLevel`),
        (r) => r.level,
        NOT_SORTABLE,
      ),
    ],
    [t],
  );
  const rows = useMemo(
    () => (presets.data ? goldenRows(presets.data, t) : []),
    [presets.data, t],
  );

  const waiting = query.isFetching;

  return (
    <SectionCard title={t(`${C}.scenario.title`)} bodyClassName="space-y-4">
      <p className="text-sm text-muted">{t(`${C}.scenario.description`)}</p>

      <Select
        label={t(`${C}.scenario.preset`)}
        placeholder={t(`${C}.scenario.presetNone`)}
        disabled={!presets.data}
        options={(presets.data ?? []).map((p) => ({
          value: p.key,
          label: goldenName(p.key, t),
        }))}
        onChange={(e) => onPreset(e.target.value)}
      />

      <Form form={form} onSubmit={run} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIO_FIELDS.map((field) => (
            <FormInput
              key={field}
              name={field}
              label={t(SCENARIO_LABEL_KEY[field])}
              inputMode="decimal"
              inputSize="sm"
            />
          ))}
        </div>
        {candidate.params && candidate.modified && (
          <p className="text-sm text-muted">
            {t(`${C}.scenario.candidateApplied`)}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            type="submit"
            isLoading={waiting}
            disabled={waiting || !form.formState.isValid}
          >
            {t(`${C}.scenario.run`)}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              form.reset(EMPTY_SCENARIO);
              clear();
            }}
          >
            {t(`${C}.scenario.reset`)}
          </Button>
        </div>
      </Form>

      {waiting && <LabLoading />}
      {!waiting && query.isError && (
        <LabError error={query.error} onRetry={() => void query.refetch()} />
      )}
      {!waiting && query.data && (
        <div
          className="grid grid-cols-1 gap-4 xl:grid-cols-2"
          data-testid="scenario-result"
        >
          <ExplainPanel
            title={t(`${C}.seller.recomputedTitle`)}
            explanation={query.data.v1}
            formulaVersion={1}
          />
          {query.data.candidate && (
            <ExplainPanel
              title={t(`${C}.seller.candidateTitle`)}
              explanation={query.data.candidate}
              candidate
            />
          )}
        </div>
      )}

      <div className="space-y-2">
        <SectionTitle as="h3" size="sm">
          {t(`${C}.golden.title`)}
        </SectionTitle>
        <p className="text-sm text-muted">{t(`${C}.golden.description`)}</p>
        {presets.isError ? (
          <LabError
            error={presets.error}
            onRetry={() => void presets.refetch()}
          />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => String(r.id)}
            loading={presets.isLoading}
            dense
          />
        )}
      </div>
    </SectionCard>
  );
}
