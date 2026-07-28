import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { JwtPayload, RequestUser } from "../interfaces";
import { PrismaService } from "../../../prisma";
import { COOKIE_NAMES, readCookie } from "../utils/auth-cookies";
import { i18nMessage } from "../../i18n";
import { SecurityService } from "../../security/security.service";

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, "admin-jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly securityService: SecurityService,
  ) {
    super({
      // Önce httpOnly cookie (tarayıcı), yoksa Authorization header (mobil/araçlar).
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => readCookie(req, [COOKIE_NAMES.admin.access]),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("ADMIN_JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Verify it's an access token and is admin
    if (payload.type !== "access" || !payload.isAdmin) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.invalidAdminToken"),
      );
    }

    if (!payload.sessionToken) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.invalidAdminToken"),
      );
    }
    const sessionAdminId = await this.securityService.validateAdminSession(
      payload.sessionToken,
    );
    if (!sessionAdminId) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.invalidAdminToken"),
      );
    }

    // Check if admin user exists and is active – select only User columns that exist in DB
    const adminUser = await this.prisma.adminUser.findFirst({
      where: {
        id: sessionAdminId,
        userId: payload.sub,
        isActive: true,
      },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            email: true,
            isSeller: true,
            isBanned: true,
            deletedAt: true,
          },
        },
      },
    });

    if (
      !adminUser ||
      !adminUser.user ||
      adminUser.user.isBanned ||
      adminUser.user.deletedAt
    ) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.adminUserNotFoundOrInactive"),
      );
    }

    return {
      id: adminUser.user.id,
      email: adminUser.user.email,
      isSeller: adminUser.user.isSeller,
      isAdmin: true,
      adminId: adminUser.id,
      sessionToken: payload.sessionToken,
      role: adminUser.role,
    };
  }
}
