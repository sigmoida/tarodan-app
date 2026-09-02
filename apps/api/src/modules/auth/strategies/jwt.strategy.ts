import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { JwtPayload, RequestUser } from "../interfaces";
import { PrismaService } from "../../../prisma";
import { COOKIE_NAMES, readCookie } from "../utils/auth-cookies";
import { i18nMessage } from "../../i18n";
import {
  assertNotStaffAccount,
  STAFF_ACCOUNT_SELECT,
} from "../utils/staff-account";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Önce httpOnly cookie (tarayıcı), yoksa Authorization header (mobil).
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => readCookie(req, [COOKIE_NAMES.user.access]),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Verify it's an access token
    if (payload.type !== "access") {
      throw new UnauthorizedException(
        i18nMessage("server.auth.invalidTokenType"),
      );
    }

    // Her korumalı istekte çalışan sıcak yol: yalnız gereken sütunlar.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        isSeller: true,
        preferredLanguage: true,
        deletedAt: true,
        ...STAFF_ACCOUNT_SELECT,
      },
    });

    if (!user) {
      throw new UnauthorizedException(i18nMessage("server.auth.userNotFound"));
    }

    // Silinmiş (anonimleştirilmiş) hesap: satır FK'lar için korunur ama erişim reddedilir.
    if (user.deletedAt) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.accountDeleted"),
      );
    }

    // Personel hesabı kullanıcı (web/mobil) token'ıyla hiçbir uca giremez;
    // elde kalmış eski oturumlar da burada kapanır. Yönetim paneli ayrı
    // strateji ve ayrı gizli anahtarla (AdminJwtStrategy) çalışır.
    assertNotStaffAccount(user);

    // Kullanıcı token'ı admin bilgisi TAŞIMAZ (isAdmin/role yalnız admin
    // stratejisinden gelir).
    return {
      id: user.id,
      email: user.email,
      isSeller: user.isSeller,
      preferredLanguage: user.preferredLanguage,
    };
  }
}
