"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, Button } from "@tarodan/ui";
import {
  Form,
  FormCheckbox,
  FormInput,
  FormSelect,
  useZodForm,
} from "@tarodan/ui/form";
import { isNotFoundError } from "@/lib/error";
import { SectionCard } from "@/components/detail/SectionCard";
import {
  SELLER_FORM_DEFAULTS,
  isUserId,
  sellerSchema,
  type SellerFormValues,
} from "../_lib/sellerSchema";
import type { CandidateParams } from "../_lib/useCandidateParams";
import { useLabSeller } from "../_lib/useSellerTrustLab";
import { LabError, LabLoading } from "./LabResultState";
import { SellerResult } from "./SellerResult";

const S = "admin.system.sellerTrustLab.seller";

/**
 * Explain one seller (deep link `?userId=`): live recompute against the
 * stored row, optionally with the candidate parameters. The run is a read,
 * keyed on the submitted request.
 */
export function SellerCard({ candidate }: { candidate: CandidateParams }) {
  const t = useTranslations();
  const searchUserId = useSearchParams().get("userId");
  const form = useZodForm(sellerSchema(t), {
    defaultValues: {
      ...SELLER_FORM_DEFAULTS,
      userId: isUserId(searchUserId) ? searchUserId.trim() : "",
    },
  });
  const { query, submit } = useLabSeller();

  const run = (values: SellerFormValues) =>
    submit({
      userId: values.userId.trim(),
      body: {
        asOf: values.asOf,
        ...(values.useCandidate && candidate.params
          ? { params: candidate.params }
          : {}),
      },
    });

  // A deep link from the user detail runs once on arrival.
  const autoRun = useRef(false);
  useEffect(() => {
    if (autoRun.current || !isUserId(searchUserId)) return;
    autoRun.current = true;
    void form.handleSubmit(run)();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const useCandidate = form.watch("useCandidate");
  const waiting = query.isFetching;

  return (
    <SectionCard title={t(`${S}.title`)} bodyClassName="space-y-4">
      <Form form={form} onSubmit={run} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormInput
            name="userId"
            label={t(`${S}.userId`)}
            placeholder={t(`${S}.userIdHint`)}
            autoComplete="off"
          />
          <FormSelect
            name="asOf"
            label={t(`${S}.asOf`)}
            options={[
              { value: "now", label: t(`${S}.asOfNow`) },
              { value: "stored", label: t(`${S}.asOfStored`) },
            ]}
          />
        </div>
        <FormCheckbox
          name="useCandidate"
          label={t(`${S}.useCandidate`)}
          disabled={candidate.params === null}
        />
        <Button
          type="submit"
          isLoading={waiting}
          disabled={waiting || (useCandidate && candidate.params === null)}
        >
          {t(`${S}.run`)}
        </Button>
      </Form>

      {waiting && <LabLoading />}
      {!waiting &&
        query.isError &&
        (isNotFoundError(query.error) ? (
          <Alert variant="warning">{t(`${S}.notFound`)}</Alert>
        ) : (
          <LabError error={query.error} onRetry={() => void query.refetch()} />
        ))}
      {!waiting && query.data && <SellerResult seller={query.data} />}
    </SectionCard>
  );
}
