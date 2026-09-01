import type { AccountStatus } from "@tarodan/types";

/** Tekil ve toplu olarak uygulanabilen kullanıcı aksiyonları. */
export type UserAccountAction = "resend" | "verify" | "ban" | "unban";

/** Aksiyonların hedef aldığı en küçük satır şekli — liste ve detay ikisi de sağlar. */
export interface UserAccountTarget {
  id: string;
  accountStatus: AccountStatus;
}

/**
 * Bir aksiyon hangi hesap durumunda anlamlı? Silinmiş hesap hiçbirinde;
 * aktivasyon aksiyonları yalnız bekleyende; engel kaldırma yalnız engellide.
 */
const ELIGIBLE: Record<UserAccountAction, readonly AccountStatus[]> = {
  resend: ["pending_activation"],
  verify: ["pending_activation"],
  ban: ["active", "pending_activation"],
  unban: ["banned"],
};

export function isEligible(
  action: UserAccountAction,
  status: AccountStatus,
): boolean {
  return ELIGIBLE[action].includes(status);
}

/** Seçimden, aksiyonun gerçekten uygulanacağı id'ler (uygun olmayanlar atlanır). */
export function eligibleIds(
  action: UserAccountAction,
  rows: readonly UserAccountTarget[],
): string[] {
  return rows
    .filter((row) => isEligible(action, row.accountStatus))
    .map((row) => row.id);
}

/** Satır menüsü / detay butonları: bu durumda hangi aksiyonlar gösterilir. */
export function actionsForStatus(status: AccountStatus): UserAccountAction[] {
  return (Object.keys(ELIGIBLE) as UserAccountAction[]).filter((action) =>
    isEligible(action, status),
  );
}
