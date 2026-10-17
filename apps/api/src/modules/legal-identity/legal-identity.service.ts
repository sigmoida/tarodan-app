import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  normalizeTckn,
  type LegalIdentityStatus,
  type LegalIdentityValues,
  type SubmitLegalIdentityRequest,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { i18nMessage } from "../i18n";
import { getRequestClientInfo } from "../../common/context/request-context";
import {
  LEGAL_IDENTITY_SUBJECT_SELECT,
  LEGAL_IDENTITY_SUBMIT_LIMITS,
  assertCorrectable,
  buildLegalIdentityStatus,
  legalIdentityLocked,
  legalIdentityRateLimitKeys,
  nationalIdUnavailable,
  planAdminCorrection,
  planMemberSubmission,
  rethrowNationalIdConflict,
  stillEmptyWhere,
  type LegalIdentityChange,
} from "./helpers/legal-identity-status";

/** Okuma/yazım için gereken en dar istemci: PrismaService ya da bir transaction. */
export type LegalIdentityDb = Pick<Prisma.TransactionClient, "user">;

const VALUES_SELECT = {
  legalFirstName: true,
  legalLastName: true,
  nationalId: true,
} satisfies Prisma.UserSelect;

/**
 * Üyenin yasal kimliğinin (ad, soyad, TCKN) TEK yazım noktası: kimlik kapısı,
 * kayıt ve admin düzeltmesi buradan geçer; tekillik ve hız sınırı burada.
 *
 * Kapının zorlaması İSTEMCİDEDİR (web penceresi, mobil ekranı): sunucu eksik
 * kimlikli üyenin isteklerini reddetmez — bugünkü mobil sürümler kapıyı
 * bilmiyor, reddetmek onları kilitlerdi (onay kapısıyla aynı karar).
 *
 * TCKN hiçbir koşulda loglanmaz; hata mesajları başka bir hesabı ele vermez.
 */
@Injectable()
export class LegalIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Kapı durumu: eksik alanlar (muaf hesapta boş) + maskeli değerler. */
  async getStatus(userId: string): Promise<LegalIdentityStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...LEGAL_IDENTITY_SUBJECT_SELECT,
        bankAccount: { select: { tcKimlikNo: true } },
      },
    });
    if (!user) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }
    return buildLegalIdentityStatus(user, user.bankAccount?.tcKimlikNo ?? null);
  }

  /**
   * Üyenin kapıdan gönderimi. Dolu alan değişmez; eksikler doldurulur. TCKN
   * yazılacaksa önce hız sınırı, sonra tekillik — uç bir "numara kayıtlı mı"
   * kahini olduğu için. Yazım koşulludur (alanlar hâlâ boşsa): aynı anda gelen
   * iki gönderimden kaybeden, ilkini ezmek yerine "kilitli" yanıtı alır.
   */
  async submit(
    userId: string,
    input: SubmitLegalIdentityRequest,
  ): Promise<LegalIdentityStatus> {
    const current = await this.readValues(userId);
    const change = planMemberSubmission(current, input);

    if (change.changed.length > 0) {
      const { nationalId } = change.data;
      if (nationalId) {
        await this.consumeLookupBudget(userId);
        await this.assertNationalIdAvailable(nationalId, userId);
      }
      const written = await this.prisma.user
        .updateMany({
          where: { id: userId, ...stillEmptyWhere(change.changed) },
          data: change.data,
        })
        .catch((error: unknown) => rethrowNationalIdConflict(error));
      if (written.count === 0) throw legalIdentityLocked();
    }
    return this.getStatus(userId);
  }

  /**
   * Admin düzeltmesi — çağıran (admin servisi) bunu denetim kaydıyla AYNI
   * transaction'da çalıştırır; DB tekillik yarışı (P2002) transaction'ı
   * bozacağı için çağıran `rethrowNationalIdConflict` ile çevirir. Silinmiş
   * ve personel hesabı düzeltilemez (`assertCorrectable`).
   */
  async applyCorrection(
    userId: string,
    input: SubmitLegalIdentityRequest,
    db: LegalIdentityDb,
  ): Promise<LegalIdentityChange> {
    const subject = await db.user.findUnique({
      where: { id: userId },
      select: {
        ...VALUES_SELECT,
        deletedAt: true,
        adminUser: { select: { id: true } },
      },
    });
    if (!subject) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }
    assertCorrectable(subject);
    const {
      deletedAt: _deletedAt,
      adminUser: _adminUser,
      ...current
    } = subject;
    const change = planAdminCorrection(current, input);
    if (change.data.nationalId) {
      await this.assertNationalIdAvailable(change.data.nationalId, userId, db);
    }
    await db.user.update({
      where: { id: userId },
      data: change.data,
      select: { id: true },
    });
    return change;
  }

  /**
   * Numara başka bir hesapta mı. Yanıt o hesap hakkında HİÇBİR şey söylemez.
   * `exceptUserId` üyenin kendi satırıdır (aynı numarayı yeniden göndermek
   * çakışma değildir).
   */
  async assertNationalIdAvailable(
    nationalId: string,
    exceptUserId: string | null = null,
    db: LegalIdentityDb = this.prisma,
  ): Promise<void> {
    const holder = await db.user.findUnique({
      where: { nationalId: normalizeTckn(nationalId) },
      select: { id: true },
    });
    if (holder && holder.id !== exceptUserId) throw nationalIdUnavailable();
  }

  /**
   * Tekillik sorgusunun hız bütçesi: üye başına (günlük) ve istemci IP'si
   * başına (saatlik). Kayıt formu da TCKN gönderince aynı IP bütçesinden
   * harcar — kayıt ucu da aynı kahindir. Kova anahtarlarında TCKN yoktur.
   */
  async consumeLookupBudget(userId: string | null): Promise<void> {
    const { ipAddress } = getRequestClientInfo();
    const keys = legalIdentityRateLimitKeys(userId ?? "anonymous", ipAddress);
    const checks: Array<Promise<{ allowed: boolean; resetAt: Date }>> = [];
    if (userId) {
      const { max, windowSeconds } = LEGAL_IDENTITY_SUBMIT_LIMITS.perUser;
      checks.push(this.cache.checkRateLimit(keys.user, max, windowSeconds));
    }
    if (keys.ip) {
      const { max, windowSeconds } = LEGAL_IDENTITY_SUBMIT_LIMITS.perIp;
      checks.push(this.cache.checkRateLimit(keys.ip, max, windowSeconds));
    }
    const denied = (await Promise.all(checks)).find((r) => !r.allowed);
    if (denied) {
      const minutes = Math.max(
        1,
        Math.ceil((denied.resetAt.getTime() - Date.now()) / 60000),
      );
      throw new HttpException(
        i18nMessage("server.identity.tooManyAttempts", { minutes }),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async readValues(userId: string): Promise<LegalIdentityValues> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: VALUES_SELECT,
    });
    if (!user) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }
    return user;
  }
}
