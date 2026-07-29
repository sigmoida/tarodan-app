import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export type Application = {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  companyName: string;
  taxId: string | null;
  businessStatus: "pending" | "approved" | "rejected" | null;
  isSeller: boolean;
  createdAt: string;
};

export const applicationStatusTabs = (t: T) => [
  {
    key: "pending",
    label: t("admin.accounts.sellerApplications.tabs.pending"),
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

export const businessStatusConfig = (t: T): Record<string, StatusConfig> => ({
  pending: { label: t("common.pending"), variant: "warning" },
  approved: { label: t("common.approved"), variant: "success" },
  rejected: { label: t("common.rejected"), variant: "danger" },
});
