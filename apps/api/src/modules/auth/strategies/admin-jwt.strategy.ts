import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { JwtPayload, RequestUser } from "../interfaces";
import { PrismaService } from "../../../prisma";
import { COOKIE_NAMES, readCookie } from "../utils/auth-cookies";

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, "admin-jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
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
      throw new UnauthorizedException("Geçersiz admin token");
    }

    // Check if admin user exists and is active – select only User columns that exist in DB
    const adminUser = await this.prisma.adminUser.findFirst({
      where: {
        userId: payload.sub,
        isActive: true,
      },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            email: true,
            isSeller: true,
          },
        },
      },
    });

    if (!adminUser || !adminUser.user) {
      throw new UnauthorizedException(
        "Admin kullanıcı bulunamadı veya deaktif",
      );
    }

    return {
      id: adminUser.user.id,
      email: adminUser.user.email,
      isSeller: adminUser.user.isSeller,
      isAdmin: true,
      role: adminUser.role,
    };
  }
}
