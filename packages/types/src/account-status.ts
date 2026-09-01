/**
 * Hesap durumu — admin ekranlarının "Durum" sütunu/rozeti için TEK türetim.
 *
 * Üç ayrı bayrak (`deletedAt`, `isBanned`, `isEmailVerified`) tek bir yaşam
 * döngüsü değerine indirgenir; öncelik giriş akışıyla aynıdır (silinmiş hesap
 * engelli olsa da "silinmiş", engelli hesap aktivasyon beklese de "engelli").
 * `isVerified` (kimlik rozeti) bilinçli olarak bu türetimin dışındadır.
 */
export const ACCOUNT_STATUSES = [
  "active",
  "pending_activation",
  "banned",
  "deleted",
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface AccountStatusInput {
  deletedAt?: Date | string | null;
  isBanned?: boolean | null;
  isEmailVerified?: boolean | null;
}

export function deriveAccountStatus(input: AccountStatusInput): AccountStatus {
  if (input.deletedAt) return "deleted";
  if (input.isBanned) return "banned";
  if (!input.isEmailVerified) return "pending_activation";
  return "active";
}
