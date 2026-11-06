"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type {
  AdminInstallmentRule,
  AdminInstallmentRuleWriteResponse,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { extractErrorI18nKey } from "@/lib/error";
import { adminKeys } from "@/lib/query/keys";
import {
  invalidateAdminResources,
  useAdminMutation,
} from "@/hooks/useAdminMutation";
import {
  INSTALLMENT_PREVIEW_RESOURCE,
  INSTALLMENT_RULES_RESOURCE,
} from "../_lib/resources";
import {
  STALE_RULE_KEYS,
  parseRuleForm,
  ruleFieldOfErrorKey,
  type InstallmentRuleFormValues,
} from "../_lib/rule-form";

/** A write the API refused because the version is not current any more. */
export const isStaleRuleError = (error: unknown) =>
  STALE_RULE_KEYS.includes(extractErrorI18nKey(error) ?? "");

/**
 * Every rule version (tens of rows, no server paging). One query feeds the
 * table, the overlap check and the preview's rule names.
 */
export function useInstallmentRules() {
  return useQuery({
    queryKey: adminKeys.all(INSTALLMENT_RULES_RESOURCE),
    queryFn: async () => (await adminApi.getInstallmentRules()).data,
  });
}

export type InstallmentRulesQuery = ReturnType<typeof useInstallmentRules>;

const RULE_WRITE_INVALIDATES = [
  INSTALLMENT_RULES_RESOURCE,
  INSTALLMENT_PREVIEW_RESOURCE,
];

/** After a stale-version refusal the list is reloaded, so it shows the current version. */
function useRefreshOnStale() {
  const queryClient = useQueryClient();
  return {
    onSettled: (
      _data: AdminInstallmentRuleWriteResponse | undefined,
      error: unknown,
    ) => {
      if (error && isStaleRuleError(error)) {
        invalidateAdminResources(queryClient, RULE_WRITE_INVALIDATES);
      }
    },
  };
}

/**
 * Create a rule, or (with `replaces`) save the next version of it. A 400
 * that names a field and a stale version are shown in the form; any other
 * error is the shared toast. A stale version also refreshes the list.
 */
export function useInstallmentRuleWrite(replaces?: AdminInstallmentRule) {
  const t = useTranslations();
  const mutation = useRefreshOnStale();
  return useAdminMutation(
    async (
      values: InstallmentRuleFormValues,
    ): Promise<AdminInstallmentRuleWriteResponse> => {
      const input = parseRuleForm(values);
      return (
        replaces
          ? await adminApi.createInstallmentRuleVersion(replaces.id, input)
          : await adminApi.createInstallmentRule(input)
      ).data;
    },
    {
      invalidates: RULE_WRITE_INVALIDATES,
      successMessage: replaces
        ? t("admin.finance.installments.rules.versionCreated")
        : t("admin.finance.installments.rules.created"),
      showErrorToast: (error) =>
        !isStaleRuleError(error) &&
        !ruleFieldOfErrorKey(extractErrorI18nKey(error)),
      mutation,
    },
  );
}

/** Archive a rule version (remove). A stale version is the shared toast. */
export function useArchiveInstallmentRule() {
  const t = useTranslations();
  const mutation = useRefreshOnStale();
  return useAdminMutation(
    async (ruleId: string): Promise<AdminInstallmentRuleWriteResponse> =>
      (await adminApi.archiveInstallmentRule(ruleId)).data,
    {
      invalidates: RULE_WRITE_INVALIDATES,
      successMessage: t("admin.finance.installments.rules.archived"),
      mutation,
    },
  );
}
