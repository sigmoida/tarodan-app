"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { Form, FormCheckbox, FormInput, useZodForm } from "@tarodan/ui/form";
import { SELLER_TRUST_LEVEL_I18N_KEYS } from "@tarodan/types";
import { SectionCard } from "@/components/detail/SectionCard";
import {
  POPULATION_FORM_DEFAULTS,
  populationSchema,
  type PopulationFormValues,
} from "../_lib/populationSchema";
import { LEVEL_ORDER, buildFilters } from "../_lib/populationMappers";
import type { CandidateParams } from "../_lib/useCandidateParams";
import { useLabPopulation } from "../_lib/useSellerTrustLab";
import { LabError, LabLoading } from "./LabResultState";
import { PopulationResult } from "./PopulationResult";

const P = "admin.system.sellerTrustLab.population";

/**
 * Apply the candidate to every stored score and compare with v1. It needs a
 * valid candidate; the server caps the rows it reads (a 422 shows its own
 * message and the filters stay as they are).
 */
export function PopulationCard({ candidate }: { candidate: CandidateParams }) {
  const t = useTranslations();
  const form = useZodForm(populationSchema(t), {
    defaultValues: POPULATION_FORM_DEFAULTS,
  });
  const { query, submit } = useLabPopulation();

  const run = (values: PopulationFormValues) => {
    if (!candidate.params) return;
    submit({
      params: candidate.params,
      filters: buildFilters(values.levels, values.minTransactions),
    });
  };
  const waiting = query.isFetching;

  return (
    <SectionCard title={t(`${P}.title`)} bodyClassName="space-y-4">
      <p className="text-sm text-muted">{t(`${P}.description`)}</p>
      <p className="text-sm text-muted">{t(`${P}.source`)}</p>
      <Form form={form} onSubmit={run} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-heading">
            {t(`${P}.filterLevels`)}
          </legend>
          <div className="flex flex-wrap gap-4">
            {LEVEL_ORDER.map((level) => (
              <FormCheckbox
                key={level}
                name={`levels.${level}`}
                label={t(SELLER_TRUST_LEVEL_I18N_KEYS[level])}
              />
            ))}
          </div>
        </fieldset>
        <div className="max-w-xs">
          <FormInput
            name="minTransactions"
            label={t(`${P}.filterMinTransactions`)}
            inputMode="numeric"
            inputSize="sm"
          />
        </div>
        <Button
          type="submit"
          isLoading={waiting}
          disabled={waiting || candidate.params === null}
        >
          {t(`${P}.run`)}
        </Button>
      </Form>

      {waiting && <LabLoading />}
      {!waiting && query.isError && (
        <LabError error={query.error} onRetry={() => void query.refetch()} />
      )}
      {!waiting && query.data && <PopulationResult data={query.data} />}
    </SectionCard>
  );
}
