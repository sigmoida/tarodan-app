import type { Prisma } from "@prisma/client";
import { anonymizedEmailFor } from "../../../common/helpers/deleted-user-identity";
import {
  hasUnsettledPayout,
  type UnsettledPayoutDb,
} from "../../payout/helpers/unsettled-payout";

/** Satıcı verisi temizliğinin dokunduğu tablolar — silme transaction'ının `tx`'i. */
export type AccountDeletionSellerDataDb = UnsettledPayoutDb &
  Pick<Prisma.TransactionClient, "sellerBankAccount" | "corporateApplication">;

export interface AccountDeletionSellerDataResult {
  /**
   * Banka hesabı, hesaba hâlâ ödenecek para olduğu için KORUNDU mu? Payout
   * işleme anında GÜNCEL IBAN'ı okur (`processPendingPayouts`); satır silinirse
   * borçlu olunan hakediş `no_bank_account` ile düşer ve silinmiş hesap IBAN
   * giremeyeceği için kendiliğinden toparlanmaz.
   */
  bankAccountRetained: boolean;
}

/**
 * Hesap silmede satıcı tarafındaki kişisel veri kalıntıları (KVKK). Kimlik
 * arşive (`DeletedUserIdentity`) yazıldıktan SONRA, silme transaction'ı İÇİNDE
 * çağrılır.
 *
 * - `SellerBankAccount` (IBAN, TCKN, hesap sahibi): başka tablo FK ile ona
 *   bağlı değil; payout'lar IBAN'ı kendi satırına snapshot'lar. Ödenecek para
 *   yoksa satır silinir; varsa hakediş ödenebilsin diye korunur (bkz.
 *   `bankAccountRetained`) ve para kapanınca günlük payout cron'u siler
 *   (`purgeSettledBankAccountsOfDeletedSellers`).
 * - `CorporateApplication`: satır SİLİNMEZ — arşivin `sourceRefs`'i ona
 *   referans verir; belgeler/olaylar ona bağlıdır. Yalnız iletişim ve banka
 *   alanları temizlenir. Şirket kimliği, yetkili ve ortak kimlikleri
 *   (`authorizedFullName`, `stakeholders`) korunur: arşiv bunlardan yalnız
 *   yetkiliyle eşleşen kaydı alıyor, geri kalanı başka yerde yok.
 */
export async function purgeSellerDataForAccountDeletion(
  tx: AccountDeletionSellerDataDb,
  userId: string,
): Promise<AccountDeletionSellerDataResult> {
  const bankAccountRetained = await hasUnsettledPayout(tx, userId);
  if (!bankAccountRetained) {
    await tx.sellerBankAccount.deleteMany({ where: { userId } });
  }

  await tx.corporateApplication.updateMany({
    where: { userId },
    data: {
      // Zorunlu kolonlar: kişisel olmayan sabit değer (kullanıcı satırıyla aynı
      // sentinel e-posta).
      phone: "",
      companyEmail: anonymizedEmailFor(userId),
      contactPhone: null,
      kepAddress: null,
      iban: null,
      bankAccountHolder: null,
    },
  });

  return { bankAccountRetained };
}
