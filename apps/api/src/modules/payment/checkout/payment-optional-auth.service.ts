import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { PrismaService } from "../../../prisma";
import type { JwtPayload } from "../../auth/interfaces";
import {
  extractUserAccessToken,
  loadAccessTokenUser,
} from "../../auth/utils/user-access-token";

/**
 * İsteğe bağlı kimlikli (`@Public`) ödeme uçlarında istekteki kullanıcı:
 * - `guest`: kimlik bilgisi YOK (gerçek misafir),
 * - `user`: geçerli access token, hesap kuralları geçti,
 * - `invalid`: kimlik bilgisi VAR ama süresi dolmuş / imzasız / yanlış tip /
 *   silinmiş, personel ya da banlı hesap.
 */
export type OptionalPaymentUser =
  { kind: "guest" } | { kind: "user"; userId: string } | { kind: "invalid" };

/**
 * Korumalı uçlarla AYNI çözüm: aynı çıkarıcı sırası ve `JwtStrategy.validate`
 * kuralları (`loadAccessTokenUser`). Ban kontrolü korumalı uçlarda
 * `BannedUserGuard`'dadır ve o guard `@Public` uçları atlar; burada aynı
 * bayrak okunur ki banlı hesabın hâlâ geçerli token'ı kullanıcı sayılmasın.
 */
@Injectable()
export class PaymentOptionalAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(req: Request): Promise<OptionalPaymentUser> {
    const token = extractUserAccessToken(req);
    if (!token) return { kind: "guest" };

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      return { kind: "invalid" };
    }

    let userId: string;
    try {
      userId = (await loadAccessTokenUser(this.prisma, payload)).id;
    } catch (error: unknown) {
      // Hesap kuralı ihlali → geçersiz kimlik; DB hatası gibi diğerleri yukarı.
      if (error instanceof UnauthorizedException) return { kind: "invalid" };
      throw error;
    }

    const ban = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true },
    });
    if (ban?.isBanned) return { kind: "invalid" };

    return { kind: "user", userId };
  }
}
