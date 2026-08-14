import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../../../prisma";
import { NotificationService } from "../../notification/notification.service";
import { i18nMessage } from "../../i18n";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email-change with a 6-digit activation code. Mirrors PhoneVerificationService:
 * the NEW email lives only in the token (never on the user row) so the current
 * email stays authoritative and login keeps working until the code — sent to
 * the NEW address — is verified. An unverified request just expires.
 */
@Injectable()
export class EmailChangeService {
  static readonly CODE_TTL_MS = 15 * 60 * 1000; // 15 dakika
  static readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 sn
  static readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  private hash(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  private generateCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  async requestChange(userId: string, rawEmail: string): Promise<void> {
    const newEmail = rawEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(newEmail)) {
      throw new BadRequestException(i18nMessage("server.auth.invalidEmail"));
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }
    if (user.email.toLowerCase() === newEmail) {
      throw new BadRequestException(
        i18nMessage("server.auth.emailSameAsCurrent"),
      );
    }

    // Email is globally unique — reject if another account already owns it.
    const taken = await this.prisma.user.findFirst({
      where: { email: newEmail, id: { not: userId } },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException(
        i18nMessage("server.auth.emailAlreadyRegistered"),
      );
    }

    // Per-user resend cooldown (in addition to the controller's IP throttle).
    const last = await this.prisma.emailChangeToken.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (
      last &&
      Date.now() - new Date(last.createdAt).getTime() <
        EmailChangeService.RESEND_COOLDOWN_MS
    ) {
      throw new BadRequestException(
        i18nMessage("server.auth.emailChangeTooFrequent"),
      );
    }

    await this.prisma.emailChangeToken.deleteMany({ where: { userId } });
    const code = this.generateCode();
    const created = await this.prisma.emailChangeToken.create({
      data: {
        userId,
        newEmail,
        codeHash: this.hash(code),
        expiresAt: new Date(Date.now() + EmailChangeService.CODE_TTL_MS),
      },
    });

    // The code goes to the NEW address, never the current one.
    const result = await this.notification.sendEmailChangeCode(
      newEmail,
      code,
      EmailChangeService.CODE_TTL_MS / 1000,
    );
    if (!result.success) {
      await this.prisma.emailChangeToken.delete({
        where: { id: created.id },
      });
      throw new BadRequestException(
        i18nMessage("server.auth.emailChangeSendFailed"),
      );
    }
  }

  async verify(userId: string, code: string): Promise<{ email: string }> {
    const token = await this.prisma.emailChangeToken.findFirst({
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
    if (token.attempts >= EmailChangeService.MAX_ATTEMPTS) {
      throw new BadRequestException(
        i18nMessage("server.auth.tooManyWrongAttempts"),
      );
    }
    if (token.codeHash !== this.hash(code)) {
      await this.prisma.emailChangeToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(
        i18nMessage("server.auth.wrongVerificationCode"),
      );
    }

    // Race guard: the email may have been taken since the request.
    const dup = await this.prisma.user.findFirst({
      where: { email: token.newEmail, id: { not: userId } },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException(
        i18nMessage("server.auth.emailAlreadyRegistered"),
      );
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        // The user proved control of the new inbox, so it is verified.
        data: { email: token.newEmail, isEmailVerified: true },
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException(
          i18nMessage("server.auth.emailAlreadyRegistered"),
        );
      }
      throw error;
    }

    await this.prisma.emailChangeToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    return { email: token.newEmail };
  }
}
