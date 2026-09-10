import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Arşiv satırının kaynağı: silme anında mı alındı, geriye dönük mü toparlandı. */
export type IdentitySource = "live" | "backfill";

/** Silmeyi kimin başlattığı. `unknown` yalnız backfill satırlarında görülür. */
export type DeletionActor = "self" | "admin" | "unknown";

export interface DeletedIdentity {
  id: string;
  userId: string;
  adminCode: string | null;
  username: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  taxId: string | null;
  taxOffice: string | null;
  companyName: string | null;
  addressCity: string | null;
  addressDistrict: string | null;
  addressLine: string | null;
  iban: string | null;
  wasSeller: boolean;
  registeredAt: string;
  deletedAt: string;
  retainUntil: string;
  source: IdentitySource;
  deletedByActor: DeletionActor;
}

/** API yanıtını satır tipine indirger; eksik alanlar null'a normalize edilir. */
export function mapDeletedIdentities(raw: any[]): DeletedIdentity[] {
  return raw.map((r: any) => ({
    id: r.id,
    userId: r.userId,
    adminCode: r.adminCode ?? null,
    username: r.username,
    displayName: r.displayName ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    nationalId: r.nationalId ?? null,
    taxId: r.taxId ?? null,
    taxOffice: r.taxOffice ?? null,
    companyName: r.companyName ?? null,
    addressCity: r.addressCity ?? null,
    addressDistrict: r.addressDistrict ?? null,
    addressLine: r.addressLine ?? null,
    iban: r.iban ?? null,
    wasSeller: Boolean(r.wasSeller),
    registeredAt: r.registeredAt,
    deletedAt: r.deletedAt,
    retainUntil: r.retainUntil,
    source: r.source,
    deletedByActor: r.deletedByActor,
  }));
}

export function sourceLabel(t: T, source: IdentitySource): string {
  return source === "backfill"
    ? t("admin.deletedIdentities.sourceBackfill")
    : t("admin.deletedIdentities.sourceLive");
}

export function actorLabel(t: T, actor: DeletionActor): string {
  if (actor === "admin") return t("admin.deletedIdentities.actorAdmin");
  if (actor === "self") return t("admin.deletedIdentities.actorSelf");
  return t("admin.deletedIdentities.actorUnknown");
}

export const getSourceFilterOptions = (t: T) => [
  { value: "live", label: t("admin.deletedIdentities.sourceLive") },
  { value: "backfill", label: t("admin.deletedIdentities.sourceBackfill") },
];

export const getBooleanFilterOptions = (t: T) => [
  { value: "true", label: t("common.yes") },
  { value: "false", label: t("common.no") },
];
