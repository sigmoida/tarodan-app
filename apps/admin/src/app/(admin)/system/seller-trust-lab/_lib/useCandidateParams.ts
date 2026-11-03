"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { useZodForm } from "@tarodan/ui/form";
import {
  validateSellerTrustParams,
  type SellerTrustFormulaParams,
  type SellerTrustParamIssue,
} from "@tarodan/types";
import {
  differsFromV1,
  formToParams,
  paramsSchema,
  paramsToForm,
  validParams,
  weightsTotal,
  type ParamsFormValues,
} from "./paramsForm";

export interface CandidateParams {
  form: UseFormReturn<ParamsFormValues>;
  /** The live parameter set, the starting point of the candidate. */
  v1: SellerTrustFormulaParams;
  /** The candidate once every field is valid, else null (runs stay disabled). */
  params: SellerTrustFormulaParams | null;
  /** The candidate differs from v1. */
  modified: boolean;
  /** Total of the typed weights. */
  weightsSum: number;
  /** The shared validator's issues for the typed values. */
  issues: SellerTrustParamIssue[];
  reset: () => void;
}

/**
 * The one candidate parameter form, shared by the seller and population
 * cards. Prefilled from v1; every change re-validates the whole form, so a
 * cross-field issue (weights total, minimums) shows at once.
 */
export function useCandidateParams(
  v1: SellerTrustFormulaParams,
): CandidateParams {
  const t = useTranslations();
  const form = useZodForm(paramsSchema(t), {
    defaultValues: paramsToForm(v1),
    mode: "onChange",
  });

  useEffect(() => {
    const subscription = form.watch(() => void form.trigger());
    return () => subscription.unsubscribe();
  }, [form]);

  const values = form.watch() as ParamsFormValues;
  const serialized = JSON.stringify(values);
  return useMemo(() => {
    const typed = JSON.parse(serialized) as ParamsFormValues;
    const params = validParams(typed);
    return {
      form: form as UseFormReturn<ParamsFormValues>,
      v1,
      params,
      modified: params
        ? differsFromV1(params, v1)
        : serialized !== JSON.stringify(paramsToForm(v1)),
      weightsSum: weightsTotal(typed.weights),
      issues: validateSellerTrustParams(formToParams(typed)),
      reset: () => form.reset(paramsToForm(v1)),
    };
  }, [serialized, form, v1]);
}
