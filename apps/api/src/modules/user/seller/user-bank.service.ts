import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import {
  SELLER_ACTIONABLE_PAYOUT_FAILURES,
  isValidTckn,
  normalizeTckn,
  type PayoutFailureReason,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";

/**
 * UserBankService — satıcı banka hesabı: getBankAccount, upsertBankAccount
 * (IBAN normalize), deleteBankAccount.
 *
 * IBAN için doğrulama adımı YOKTUR: satıcı girer, kayıt tutulur. Şemadaki
 * `isVerified` / `verifiedAt` kolonları artık yazılmaz ve okunmaz; yanıta da
 * girmez (BANK_ACCOUNT_SELECT).
 */
const BANK_ACCOUNT_SELECT = {
  id: true,
  accountHolder: true,
  iban: true,
  tcKimlikNo: true,
  taxId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UserBankService {
  private readonly logger = new Logger(UserBankService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBankAccount(userId: string) {
    return this.prisma.sellerBankAccount.findUnique({
      where: { userId },
      select: BANK_ACCOUNT_SELECT,
    });
  }

  async upsertBankAccount(
    userId: string,
    data: {
      accountHolder: string;
      iban: string;
      tcKimlikNo?: string | null;
      taxId?: string;
    },
  ) {
    const normalizedIban = data.iban.replace(/\s/g, "").toUpperCase();

    // Yalnız IBAN GERÇEKTEN değişince cooldown saatini başlat (isim/tc güncellemesi
    // ödemeleri geciktirmesin). İlk kayıtta (create) ibanChangedAt null kalır → ilk
    // ödeme takılmaz; ödemeler zaten teslimden ~14 gün sonra yapılır (F2.1).
    const existing = await this.prisma.sellerBankAccount.findUnique({
      where: { userId },
      select: { iban: true, accountHolder: true, tcKimlikNo: true },
    });
    const ibanChanged = !!existing && existing.iban !== normalizedIban;
    // PayTR rejected (or the checksum refused) the details on record: only a
    // change of IBAN or holder name makes a resend worth trying.
    const payeeChanged =
      !existing ||
      ibanChanged ||
      existing.accountHolder !== data.accountHolder.trim();
    const tcKimlikNo = await this.resolveBankTckn(
      userId,
      data.tcKimlikNo,
      existing?.tcKimlikNo ?? null,
    );

    const account = await this.prisma.sellerBankAccount.upsert({
      where: { userId },
      select: BANK_ACCOUNT_SELECT,
      create: {
        userId,
        accountHolder: data.accountHolder.trim(),
        iban: normalizedIban,
        tcKimlikNo: tcKimlikNo ?? null,
        taxId: data.taxId || null,
      },
      update: {
        accountHolder: data.accountHolder.trim(),
        iban: normalizedIban,
        // Gönderilmediyse DOKUNULMAZ: web formu alanı artık göstermiyor ve her
        // IBAN kaydı eski TCKN'yi (kimlik kapısının ön doldurma kaynağı) silerdi.
        ...(tcKimlikNo !== undefined ? { tcKimlikNo } : {}),
        taxId: data.taxId || null,
        ...(ibanChanged ? { ibanChangedAt: new Date() } : {}),
      },
    });

    if (ibanChanged) {
      this.logger.warn(
        `Seller ${userId} payout IBAN changed — payout cooldown started (anti-fraud).`,
      );
    }

    // Transfers that failed for a reason the seller fixes (no bank account,
    // invalid IBAN, PayTR rejected the IBAN or holder name) never revived on
    // their own: the money waited for an admin retry although the "payout
    // failed" e-mail promises a resend. Saving the account puts them back to
    // pending; the 15-minute payout cron reads the CURRENT details at send
    // time. A save that keeps the IBAN and holder name revives only
    // no_bank_account rows: resending details PayTR already refused would
    // fail and e-mail the seller again. On an IBAN CHANGE the cooldown still
    // applies (the cron holds the pending row); we only requeue, we never
    // skip the cooldown. None of these took anything from the PayTR oid, so
    // the transId is kept (same rule as the admin retry of a failed row).
    const requeued = await this.prisma.payoutTransfer.updateMany({
      where: {
        sellerId: userId,
        status: "failed",
        failureReason: {
          in: payeeChanged
            ? [...SELLER_ACTIONABLE_PAYOUT_FAILURES]
            : ["no_bank_account" satisfies PayoutFailureReason],
        },
      },
      data: {
        status: "pending",
        failureReason: null,
        retryCount: 0,
        nextRetryAt: null,
        providerReference: null,
      },
    });
    if (requeued.count > 0) {
      this.logger.log(
        `Seller ${userId}: ${requeued.count} seller-fixable failed payout(s) requeued after the bank account was saved`,
      );
    }

    return account;
  }

  /**
   * Yazılacak banka TCKN'si; `undefined` = DOKUNMA (mevcut değer korunur).
   *
   * - Gönderilmedi (`undefined`, `null`, boş): dokunma.
   * - Kayıtlı değerin AYNISI geri geldi (istemci formunu GET yanıtıyla
   *   doldurdu): dokunma, doğrulama da yok. Bugünkü kurala uymayan ya da
   *   üyenin beyanından farklı ESKİ bir değer, IBAN güncellemesini
   *   kilitlememeli.
   * - YENİ değer: ortak TCKN kuralıyla doğrulanır (`isValidTckn`) ve üyenin
   *   yasal kimliğinde numara varsa onunla AYNI olmalıdır — banka hesabı
   *   ikinci, çelişen bir kimlik kaynağı olamaz.
   */
  private async resolveBankTckn(
    userId: string,
    sent: string | null | undefined,
    stored: string | null,
  ): Promise<string | undefined> {
    if (sent === undefined || sent === null || sent.trim() === "") {
      return undefined;
    }
    const tckn = normalizeTckn(sent);
    if (stored !== null && normalizeTckn(stored) === tckn) return undefined;
    if (!isValidTckn(tckn)) {
      throw new BadRequestException(
        i18nMessage("server.identity.nationalIdInvalid"),
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nationalId: true },
    });
    if (user?.nationalId && user.nationalId !== tckn) {
      throw new BadRequestException(
        i18nMessage("server.identity.bankNationalIdMismatch"),
      );
    }
    return tckn;
  }

  async deleteBankAccount(userId: string) {
    const existing = await this.prisma.sellerBankAccount.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new NotFoundException(
        i18nMessage("server.user.bankAccountNotFound"),
      );
    }
    await this.prisma.sellerBankAccount.delete({ where: { userId } });
    return { success: true };
  }
}
