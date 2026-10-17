import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";
import { JwtPayload, RequestUser } from "../interfaces";
import { PrismaService } from "../../../prisma";
import {
  extractUserAccessToken,
  loadAccessTokenUser,
} from "../utils/user-access-token";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Önce httpOnly cookie (tarayıcı), yoksa Authorization header (mobil).
      // İsteğe bağlı kimlikli @Public uçlarla ortak çıkarıcı.
      jwtFromRequest: extractUserAccessToken,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    return loadAccessTokenUser(this.prisma, payload);
  }
}
