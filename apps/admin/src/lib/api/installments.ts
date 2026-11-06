import type {
  AdminInstallmentPreviewResponse,
  AdminInstallmentRule,
  AdminInstallmentRuleWriteResponse,
  AdminInstallmentSettings,
  AdminInstallmentSettingsPatch,
  InstallmentBuyerSegment,
  InstallmentRuleInput,
  InstallmentSegment,
} from "@tarodan/types";
import { api } from "./client";

const BASE = "/admin/installments";

/**
 * `GET /admin/installments/preview` query. With `draftMinCount` the draft
 * rule is priced as if it were live now and newest; `replacesRuleId` leaves
 * the edited version out of the live candidates.
 */
export interface AdminInstallmentPreviewParams {
  segment: InstallmentBuyerSegment;
  /** Goods total T, TL. */
  amount: number;
  family: string;
  draftSegment?: InstallmentSegment;
  draftMinCount?: number;
  draftMaxCount?: number;
  draftAllowed?: boolean;
  draftPlatformSharePct?: number;
  draftPriority?: number;
  replacesRuleId?: string;
}

/**
 * Finance > Installments (`AdminInstallmentsController`, ADR 0019). Reads
 * for super_admin and admin; every write is super_admin only (the API
 * enforces it, the screen hides the controls).
 */
export const installmentsApi = {
  getInstallmentSettings: () =>
    api.get<AdminInstallmentSettings>(`${BASE}/settings`),
  updateInstallmentSettings: (patch: AdminInstallmentSettingsPatch) =>
    api.patch<AdminInstallmentSettings>(`${BASE}/settings`, patch),
  getInstallmentRules: () => api.get<AdminInstallmentRule[]>(`${BASE}/rules`),
  createInstallmentRule: (input: InstallmentRuleInput) =>
    api.post<AdminInstallmentRuleWriteResponse>(`${BASE}/rules`, input),
  createInstallmentRuleVersion: (ruleId: string, input: InstallmentRuleInput) =>
    api.post<AdminInstallmentRuleWriteResponse>(
      `${BASE}/rules/${encodeURIComponent(ruleId)}/versions`,
      input,
    ),
  archiveInstallmentRule: (ruleId: string) =>
    api.post<AdminInstallmentRuleWriteResponse>(
      `${BASE}/rules/${encodeURIComponent(ruleId)}/archive`,
    ),
  previewInstallments: (params: AdminInstallmentPreviewParams) =>
    api.get<AdminInstallmentPreviewResponse>(`${BASE}/preview`, { params }),
};
