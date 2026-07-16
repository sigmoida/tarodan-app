import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { JwtPayload } from "../interfaces";
import { PrismaService } from "../../../prisma";
import { COOKIE_NAMES, readCookie } from "../utils/auth-cookies";
import { i18nMessage } from "../../i18n";

/** İsteğin taşıdığı refresh token'ı çıkarır: önce httpOnly cookie, yoksa body `refreshToken`
 *  (mobil/eski istemciler). Aynı tarayıcıda hem kullanıcı hem admin cookie'si bulunabilir
 *  (prod'da .tarodan.shop paylaşımlı); bu yüzden hangi cookie'nin önce okunacağını ROTAYA göre
 *  seçeriz: /auth/admin/refresh → admin cookie öncelikli, diğer hâllerde kullanıcı cookie öncelikli. */
function extractRefreshToken(req: Request): string | null {
  const url = req.originalUrl || req.url || "";
  const isAdminRoute = url.includes("/auth/admin/refresh");
  const names = isAdminRoute
    ? [COOKIE_NAMES.admin.refresh, COOKIE_NAMES.user.refresh]
    : [COOKIE_NAMES.user.refresh, COOKIE_NAMES.admin.refresh];
  return (
    readCookie(req, names) ||
    (req.body?.refreshToken as string | undefined) ||
    null
  );
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh",
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractRefreshToken]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // Verify it's a refresh token
    if (payload.type !== "refresh") {
      throw new UnauthorizedException(i18nMessage("server.auth.invalidTokenType"));
    }

    // Check if user still exists
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException(i18nMessage("server.auth.userNotFound"));
    }

    // Return user info along with the refresh token for rotation.
    // isAdmin/role payload'dan taşınır ki refreshTokens admin için admin token üretsin.
    return {
      id: user.id,
      email: user.email,
      isSeller: user.isSeller,
      isAdmin: !!payload.isAdmin,
      role: payload.role,
      refreshToken: extractRefreshToken(req) ?? "",
    };
  }
}
