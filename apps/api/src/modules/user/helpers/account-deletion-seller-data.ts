import { PaymentStatus, PayoutStatus, type Prisma } from "@prisma/client";
import { anonymizedEmailFor } from "../../../common/helpers/deleted-user-identity";

/** Satıcı verisi temizliğinin dokunduğu tablolar — silme transaction'ının `tx`'i. */
export type AccountDeletionSellerDataDb = Pick<
  Prisma.TransactionClient,
  | "payoutTransfer"
  | "tradeCashPayment"
  | "sellerBankAccount"
  | "corporateApplication"
>;

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
 * Hesaba ödenmesi gereken ama henüz ödenmemiş para var mı? Engel denetimi
 * bekleyen/işlenen payout'u ve açık blokajı zaten reddeder; burada kalanlar:
 * admin'in yeniden deneyebileceği `failed` / `returned` transferler ve
 * serbest kalmış ama transferi henüz üretilmemiş takas nakit farkı.
 */
async function hasUnsettledPayout(
  tx: AccountDeletionSellerDataDb,
  userId: string,
): Promise<boolean> {
  const [openTransfers, unpaidTradeCash] = await Promise.all([
    tx.payoutTransfer.count({
      where: { sellerId: userId, status: { not: PayoutStatus.completed } },
    }),
    tx.tradeCashPayment.count({
      where: {
        recipientId: userId,
        status: PaymentStatus.completed,
        amount: { gt: 0 },
        payoutTransfers: { none: {} },
      },
    }),
  ]);
  return openTransfers > 0 || unpaidTradeCash > 0;
}

/**
 * Hesap silmede satıcı tarafındaki kişisel veri kalıntıları (KVKK). Kimlik
 * arşive (`DeletedUserIdentity`) yazıldıktan SONRA, silme transaction'ı İÇİNDE
 * çağrılır.
 *
 * - `SellerBankAccount` (IBAN, TCKN, hesap sahibi): başka tablo FK ile ona
 *   bağlı değil; payout'lar IBAN'ı kendi satırına snapshot'lar. Ödenecek para
 *   yoksa satır silinir; varsa hakediş ödenebilsin diye korunur (bkz.
 *   `bankAccountRetained`).
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
