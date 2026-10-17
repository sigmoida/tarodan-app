import { UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { ExtractJwt } from "passport-jwt";
import type { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";
import type { JwtPayload, RequestUser } from "../interfaces";
import { COOKIE_NAMES, readCookie } from "./auth-cookies";
import { assertNotStaffAccount, STAFF_ACCOUNT_SELECT } from "./staff-account";

/**
 * Kullanıcı access token'ının istekteki yeri — TEK kaynak. `JwtStrategy`
 * (korumalı uçlar) ve isteğe bağlı kimlikli `@Public` uçlar (ödeme) aynı
 * sırayla okur, böylece ikisi aynı isteği aynı kullanıcıya çözer: önce
 * httpOnly cookie (tarayıcı), yoksa `Authorization: Bearer` (mobil / BFF).
 */
export const extractUserAccessToken: (req: Request) => string | null =
  ExtractJwt.fromExtractors([
    (req: Request) => readCookie(req, [COOKIE_NAMES.user.access]),
    ExtractJwt.fromAuthHeaderAsBearerToken(),
  ]);

/**
 * İmzası doğrulanmış bir access token'ın kullanıcısını yükler ve hesap
 * kurallarını uygular (token tipi, silinmiş hesap, personel hesabı).
 * `JwtStrategy.validate` budur; isteğe bağlı kimlikli uçlar da aynı kuralı
 * buradan alır. Kural ihlali `UnauthorizedException` fırlatır.
 */
export async function loadAccessTokenUser(
  prisma: PrismaService,
  payload: JwtPayload,
): Promise<RequestUser> {
  // Verify it's an access token
  if (payload.type !== "access") {
    throw new UnauthorizedException(
      i18nMessage("server.auth.invalidTokenType"),
    );
  }

  // Her korumalı istekte çalışan sıcak yol: yalnız gereken sütunlar.
  const user = await prisma.user.findUnique({
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
    throw new UnauthorizedException(i18nMessage("server.auth.accountDeleted"));
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
