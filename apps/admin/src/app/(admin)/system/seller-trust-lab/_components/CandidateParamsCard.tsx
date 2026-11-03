"use client";

import { useTranslations } from "next-intl";
import { Badge, Button } from "@tarodan/ui";
import { Form, FormInput } from "@tarodan/ui/form";
import type { SellerTrustComponentKey } from "@tarodan/types";
import { fmtDecimal } from "@/lib/format";
import { Panel } from "@/components/detail/Panel";
import { SectionCard } from "@/components/detail/SectionCard";
import { SectionTitle } from "@/components/detail/SectionTitle";
import type { CandidateParams } from "../_lib/useCandidateParams";

/** Catalog key of each component's heading (next-intl wants literal keys). */
const COMPONENT_LABEL = {
  rating: "admin.users.detail.trust.components.rating",
  reliability: "admin.users.detail.trust.components.reliability",
  onTime: "admin.users.detail.trust.components.onTime",
  volume: "admin.users.detail.trust.components.volume",
  tenure: "admin.users.detail.trust.components.tenure",
} as const satisfies Record<SellerTrustComponentKey, string>;

const P = "admin.system.sellerTrustLab.params";

function NumberInput({ name, label }: { name: string; label: string }) {
  return (
    <FormInput name={name} label={label} inputMode="decimal" inputSize="sm" />
  );
}

/**
 * The one candidate parameter form (weights, priors, minimums and the
 * allowed constants), prefilled from v1. Seller and population runs read it;
 * nothing here is saved. Invalid values show inline, in the API's terms.
 */
export function CandidateParamsCard({
  candidate,
}: {
  candidate: CandidateParams;
}) {
  const t = useTranslations();
  const { form, modified, weightsSum, issues } = candidate;
  const weightsIssue = issues.some((issue) => issue.code === "weightsSum");

  return (
    <SectionCard
      title={t(`${P}.title`)}
      actions={
        <div className="flex items-center gap-2">
          {modified && <Badge variant="warning">{t(`${P}.modified`)}</Badge>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={candidate.reset}
            disabled={!modified}
          >
            {t(`${P}.resetToV1`)}
          </Button>
        </div>
      }
      bodyClassName="space-y-4"
    >
      <p className="text-sm text-muted">{t(`${P}.description`)}</p>
      <Badge variant="outline">
        {t("admin.system.sellerTrustLab.candidateLabel")}
      </Badge>
      <Form form={form} onSubmit={() => undefined} className="space-y-4">
        <Panel tone="muted" padding="sm" className="space-y-3">
          <SectionTitle as="h3" size="sm">
            {t(`${P}.weights`)}
          </SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(COMPONENT_LABEL) as SellerTrustComponentKey[]).map(
              (key) => (
                <NumberInput
                  key={key}
                  name={`weights.${key}`}
                  label={t(COMPONENT_LABEL[key])}
                />
              ),
            )}
          </div>
          <p
            role={weightsIssue ? "alert" : undefined}
            className={
              weightsIssue ? "text-sm text-danger-700" : "text-sm text-muted"
            }
          >
            {weightsIssue
              ? t(`${P}.errors.weightsSum`, {
                  sum: fmtDecimal(weightsSum, 4) ?? "",
                })
              : t(`${P}.weightsSum`, { sum: fmtDecimal(weightsSum, 4) ?? "" })}
          </p>
        </Panel>

        <Panel tone="muted" padding="sm" className="space-y-3">
          <SectionTitle as="h3" size="sm">
            {t(`${P}.priors`)}
          </SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <NumberInput
              name="rating.priorMean"
              label={`${t(COMPONENT_LABEL.rating)}: ${t(`${P}.priorMean`)}`}
            />
            <NumberInput
              name="rating.priorWeight"
              label={`${t(COMPONENT_LABEL.rating)}: ${t(`${P}.priorWeight`)}`}
            />
            <NumberInput
              name="reliability.priorRate"
              label={`${t(COMPONENT_LABEL.reliability)}: ${t(`${P}.priorRate`)}`}
            />
            <NumberInput
              name="reliability.priorWeight"
              label={`${t(COMPONENT_LABEL.reliability)}: ${t(`${P}.priorWeight`)}`}
            />
            <NumberInput
              name="reliability.zeroAt"
              label={`${t(COMPONENT_LABEL.reliability)}: ${t(`${P}.zeroAt`)}`}
            />
            <NumberInput
              name="onTime.priorRate"
              label={`${t(COMPONENT_LABEL.onTime)}: ${t(`${P}.priorRate`)}`}
            />
            <NumberInput
              name="onTime.priorWeight"
              label={`${t(COMPONENT_LABEL.onTime)}: ${t(`${P}.priorWeight`)}`}
            />
            <NumberInput
              name="onTime.zeroAt"
              label={`${t(COMPONENT_LABEL.onTime)}: ${t(`${P}.zeroAt`)}`}
            />
            <NumberInput
              name="volume.saturation"
              label={t(`${P}.saturation`)}
            />
            <NumberInput
              name="tenure.fullAtDays"
              label={t(`${P}.fullAtDays`)}
            />
          </div>
        </Panel>

        <Panel tone="muted" padding="sm" className="space-y-3">
          <SectionTitle as="h3" size="sm">
            {t(`${P}.minimums`)}
          </SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberInput
              name="minimum.transactions"
              label={t(`${P}.minTransactions`)}
            />
            <NumberInput
              name="minimum.counterparties"
              label={t(`${P}.minCounterparties`)}
            />
          </div>
        </Panel>
      </Form>
    </SectionCard>
  );
}
