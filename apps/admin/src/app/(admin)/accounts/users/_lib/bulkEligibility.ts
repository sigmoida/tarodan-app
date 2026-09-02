import type { AccountStatus } from "@tarodan/types";

/** Tekil ve toplu olarak uygulanabilen kullanıcı aksiyonları. */
export type UserAccountAction =
  "resend" | "verify" | "ban" | "unban" | "delete";

/** Aksiyonların hedef aldığı en küçük satır şekli — liste ve detay ikisi de sağlar. */
export interface UserAccountTarget {
  id: string;
  accountStatus: AccountStatus;
  /** Silme yalnız hiç giriş yapmamış hesapta (null/boş). */
  lastLoginAt?: string | null;
}

/**
 * Bir aksiyon hangi hesap durumunda anlamlı? Silinmiş hesap hiçbirinde;
 * aktivasyon aksiyonları yalnız bekleyende; engel kaldırma yalnız engellide.
 * Silme, silinmemiş her durumda AMA yalnız hiç giriş yapmamış hesapta
 * (`lastLoginAt` boş) — sunucu da aynı kuralı 400 ile uygular.
 */
const ELIGIBLE: Record<UserAccountAction, readonly AccountStatus[]> = {
  resend: ["pending_activation"],
  verify: ["pending_activation"],
  ban: ["active", "pending_activation"],
  unban: ["banned"],
  delete: ["active", "pending_activation", "banned"],
};

export function isEligible(
  action: UserAccountAction,
  target: UserAccountTarget,
): boolean {
  if (!ELIGIBLE[action].includes(target.accountStatus)) return false;
  if (action === "delete") return !target.lastLoginAt;
  return true;
}

/** Seçimden, aksiyonun gerçekten uygulanacağı id'ler (uygun olmayanlar atlanır). */
export function eligibleIds(
  action: UserAccountAction,
  rows: readonly UserAccountTarget[],
): string[] {
  return rows.filter((row) => isEligible(action, row)).map((row) => row.id);
}

/** Satır menüsü / detay butonları: bu hesapta hangi aksiyonlar gösterilir. */
export function actionsFor(target: UserAccountTarget): UserAccountAction[] {
  return (Object.keys(ELIGIBLE) as UserAccountAction[]).filter((action) =>
    isEligible(action, target),
  );
}
