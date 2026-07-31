import { z } from "zod";
import { useTranslations } from "next-intl";
import type { StatusConfig } from "@tarodan/ui";

type T = ReturnType<typeof useTranslations<never>>;

export interface SiteAccessPin {
  id: string;
  code: string;
  label: string;
  email?: string | null;
  isActive: boolean;
  expiresAt?: string | null;
  maxUses?: number | null;
  usedCount: number;
  lastUsedAt?: string | null;
  lastSentAt?: string | null;
  createdAt: string;
}

export type PinStatus = "active" | "revoked" | "expired" | "exhausted";

/** Effective status: revocation wins, then expiry, then usage exhaustion. */
export function derivePinStatus(pin: SiteAccessPin): PinStatus {
  if (!pin.isActive) return "revoked";
  if (pin.expiresAt && new Date(pin.expiresAt) <= new Date()) return "expired";
  if (pin.maxUses != null && pin.usedCount >= pin.maxUses) return "exhausted";
  return "active";
}

export function pinStatusConfig(t: T): Record<PinStatus, StatusConfig> {
  return {
    active: { label: t("admin.earlyAccess.status.active"), variant: "success" },
    revoked: {
      label: t("admin.earlyAccess.status.revoked"),
      variant: "danger",
    },
    expired: {
      label: t("admin.earlyAccess.status.expired"),
      variant: "warning",
    },
    exhausted: {
      label: t("admin.earlyAccess.status.exhausted"),
      variant: "warning",
    },
  };
}

export function pinStatusFilterOptions(t: T) {
  return [
    { value: "all", label: t("admin.earlyAccess.filters.all") },
    { value: "active", label: t("admin.earlyAccess.filters.active") },
    { value: "revoked", label: t("admin.earlyAccess.filters.revoked") },
    { value: "expired", label: t("admin.earlyAccess.filters.expired") },
  ];
}

/** Create/edit form — validation only; string→number/ISO shaping in mutationFn. */
export const pinSchema = (t: T) =>
  z.object({
    label: z
      .string()
      .trim()
      .min(1, t("admin.earlyAccess.modal.labelRequired"))
      .max(120, t("admin.catalog.common.maxChars", { max: 120 })),
    email: z
      .string()
      .trim()
      .email(t("admin.earlyAccess.modal.emailInvalid"))
      .optional()
      .or(z.literal("")),
    expiresAt: z.string().optional().or(z.literal("")),
    maxUses: z.string().optional().or(z.literal("")),
    sendEmail: z.boolean(),
  });

export type PinFormValues = z.infer<ReturnType<typeof pinSchema>>;
