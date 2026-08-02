import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export type ApplicationStatus =
  | "submitted"
  | "preliminary_approved"
  | "invited"
  | "activated"
  | "completing"
  | "under_review"
  | "approved"
  | "rejected";

export type Application = {
  id: string;
  authorizedFullName: string;
  companyEmail: string;
  phone: string | null;
  companyLegalName: string;
  companyTitle: string;
  taxId: string | null;
  status: ApplicationStatus;
  userId: string | null;
  createdAt: string;
};

export const applicationStatusTabs = (t: T) => [
  {
    key: "submitted",
    label: t("admin.accounts.sellerApplications.tabs.submitted"),
  },
  {
    key: "invited",
    label: t("admin.accounts.sellerApplications.tabs.invited"),
  },
  {
    key: "completing",
    label: t("admin.accounts.sellerApplications.tabs.completing"),
  },
  {
    key: "under_review",
    label: t("admin.accounts.sellerApplications.tabs.underReview"),
  },
  {
    key: "approved",
    label: t("admin.accounts.sellerApplications.tabs.approved"),
  },
  {
    key: "rejected",
    label: t("admin.accounts.sellerApplications.tabs.rejected"),
  },
];

export const applicationStatusConfig = (
  t: T,
): Record<ApplicationStatus, StatusConfig> => ({
  submitted: {
    label: t("admin.accounts.sellerApplications.status.submitted"),
    variant: "warning",
  },
  preliminary_approved: {
    label: t("admin.accounts.sellerApplications.status.preliminaryApproved"),
    variant: "info",
  },
  invited: {
    label: t("admin.accounts.sellerApplications.status.invited"),
    variant: "info",
  },
  activated: {
    label: t("admin.accounts.sellerApplications.status.activated"),
    variant: "info",
  },
  completing: {
    label: t("admin.accounts.sellerApplications.status.completing"),
    variant: "warning",
  },
  under_review: {
    label: t("admin.accounts.sellerApplications.status.underReview"),
    variant: "warning",
  },
  approved: { label: t("common.approved"), variant: "success" },
  rejected: { label: t("common.rejected"), variant: "danger" },
});
