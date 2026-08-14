import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../../../prisma";
import { NetGsmProvider } from "../../notification/providers/netgsm.provider";
import { i18nMessage } from "../../i18n";

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);
  static readonly CODE_TTL_MS = 3 * 60 * 1000; // 3 dakika
  static readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 sn
  static readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly netgsm: NetGsmProvider,
  ) {}

  private hash(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  private generateCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  async sendCode(userId: string, phone: string): Promise<void> {
    const normalized = this.netgsm.formatTurkishNumber(phone);

    // M5: Geçersiz numarayı erken reddet ('+' veya çöp giriş)
    if (!/^\+905\d{9}$/.test(normalized)) {
      throw new BadRequestException(
        i18nMessage("server.auth.invalidPhoneNumber"),
      );
    }

    // I2: Sadece DOĞRULANMIŞ bir sahip çakışma sayılır; doğrulanmamış holder engel değil.
    const taken = await this.prisma.user.findFirst({
      where: { phone: normalized, isPhoneVerified: true, id: { not: userId } },
    });
    if (taken) {
      throw new ConflictException(
        i18nMessage("server.auth.phoneAlreadyRegisteredOtherAccount"),
      );
    }

    // I1 + M1: Cooldown, son token'a göre hesaplanır (usedAt'tan bağımsız).
    // Bu, yeni SMS flooding'ini hem IP başına @Throttle hem de kullanıcı başına bu 60s
    // cooldown ile sınırlar; doğrulama sonrası hemen yeniden istek de engellenir.
    const last = await this.prisma.phoneVerificationToken.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (
      last &&
      Date.now() - new Date(last.createdAt).getTime() <
        PhoneVerificationService.RESEND_COOLDOWN_MS
    ) {
      throw new BadRequestException(
        i18nMessage("server.auth.phoneVerificationTooFrequent"),
      );
    }

    // I2: user.phone burada YAZILMIYOR; telefon yalnızca başarılı verify'da kalıcı hale gelir.
    // Token zaten phone: normalized içeriyor; verify bu değeri kullanır.

    // Eski tokenları temizle (cooldown kontrolü bundan ÖNCE yapıldı, sıra önemli)
    await this.prisma.phoneVerificationToken.deleteMany({ where: { userId } });
    const code = this.generateCode();
    const created = await this.prisma.phoneVerificationToken.create({
      data: {
        userId,
        phone: normalized,
        codeHash: this.hash(code),
        expiresAt: new Date(Date.now() + PhoneVerificationService.CODE_TTL_MS),
      },
    });

    const result = await this.netgsm.sendOtp(normalized, code);
    if (!result.success) {
      await this.prisma.phoneVerificationToken.delete({
        where: { id: created.id },
      });
      // NetGSM'in kendi hata metni varsa onu koru (harici sağlayıcı detayı, katalogda
      // karşılığı yok); yoksa genel "SMS gönderilemedi" katalog anahtarına düş.
      if (result.error) {
        throw new BadRequestException(result.error);
      }
      throw new BadRequestException(i18nMessage("server.auth.smsSendFailed"));
    }

    // #224: başarı mesajı AuthController.sendPhoneCode() tarafından locale'e göre
    // kuruluyor (server.auth.phoneVerificationCodeSent).
  }

  async verify(
    userId: string,
    code: string,
  ): Promise<{ isPhoneVerified: true }> {
    const token = await this.prisma.phoneVerificationToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!token) {
      throw new BadRequestException(
        i18nMessage("server.auth.noActiveVerificationCode"),
      );
    }
    if (new Date(token.expiresAt) < new Date()) {
      throw new BadRequestException(
        i18nMessage("server.auth.verificationCodeExpired"),
      );
    }
    if (token.attempts >= PhoneVerificationService.MAX_ATTEMPTS) {
      throw new BadRequestException(
        i18nMessage("server.auth.tooManyWrongAttempts"),
      );
    }

    if (token.codeHash !== this.hash(code)) {
      await this.prisma.phoneVerificationToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(
        i18nMessage("server.auth.wrongVerificationCode"),
      );
    }

    // I2: Yarış koruması — başka biri bu numarayı verify etmiş mi?
    const dup = await this.prisma.user.findFirst({
      where: { phone: token.phone, isPhoneVerified: true, id: { not: userId } },
    });
    if (dup) {
      throw new ConflictException(
        i18nMessage("server.auth.phoneAlreadyRegisteredOtherAccount"),
      );
    }

    // I2: Telefon numarasını ve doğrulama durumunu atomik olarak yaz.
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { phone: token.phone, isPhoneVerified: true },
      });
    } catch (error: any) {
      // P2002: unique constraint ihlali (nadir yarış durumu) — ek savunma katmanı
      if (error?.code === "P2002") {
        throw new ConflictException(
          i18nMessage("server.auth.phoneAlreadyRegisteredOtherAccount"),
        );
      }
      throw error;
    }

    await this.prisma.phoneVerificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    // #224: başarı mesajı AuthController.verifyPhone() tarafından locale'e göre
    // kuruluyor (server.auth.phoneVerificationSuccess).
    return { isPhoneVerified: true };
  }
}
