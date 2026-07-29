import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";

/**
 * UserBankService — satıcı banka hesabı: getBankAccount, upsertBankAccount
 * (IBAN normalize + verified sıfırla), deleteBankAccount.
 */
@Injectable()
export class UserBankService {
  private readonly logger = new Logger(UserBankService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBankAccount(userId: string) {
    return this.prisma.sellerBankAccount.findUnique({
      where: { userId },
    });
  }

  async upsertBankAccount(
    userId: string,
    data: {
      accountHolder: string;
      iban: string;
      tcKimlikNo?: string;
      taxId?: string;
    },
  ) {
    const normalizedIban = data.iban.replace(/\s/g, "").toUpperCase();

    // Yalnız IBAN GERÇEKTEN değişince cooldown saatini başlat (isim/tc güncellemesi
    // ödemeleri geciktirmesin). İlk kayıtta (create) ibanChangedAt null kalır → ilk
    // ödeme takılmaz; ödemeler zaten teslimden ~14 gün sonra yapılır (F2.1).
    const existing = await this.prisma.sellerBankAccount.findUnique({
      where: { userId },
      select: { iban: true },
    });
    const ibanChanged = !!existing && existing.iban !== normalizedIban;

    const account = await this.prisma.sellerBankAccount.upsert({
      where: { userId },
      create: {
        userId,
        accountHolder: data.accountHolder.trim(),
        iban: normalizedIban,
        tcKimlikNo: data.tcKimlikNo || null,
        taxId: data.taxId || null,
      },
      update: {
        accountHolder: data.accountHolder.trim(),
        iban: normalizedIban,
        tcKimlikNo: data.tcKimlikNo || null,
        taxId: data.taxId || null,
        isVerified: false,
        verifiedAt: null,
        ...(ibanChanged ? { ibanChangedAt: new Date() } : {}),
      },
    });

    if (ibanChanged) {
      this.logger.warn(
        `Seller ${userId} payout IBAN changed — payout cooldown started (anti-fraud).`,
      );
    }
    return account;
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
