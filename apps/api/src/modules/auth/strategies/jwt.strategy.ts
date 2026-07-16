import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload, RequestUser } from '../interfaces';
import { PrismaService } from '../../../prisma';
import { COOKIE_NAMES, readCookie } from '../utils/auth-cookies';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
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
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Verify it's an access token
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Geçersiz token tipi');
    }

    // Check if user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { adminUser: true },
    });

    if (!user) {
      throw new UnauthorizedException('Kullanıcı bulunamadı');
    }

    // Silinmiş (anonimleştirilmiş) hesap: satır FK'lar için korunur ama erişim reddedilir.
    if (user.deletedAt) {
      throw new UnauthorizedException('Hesap silinmiş');
    }

    return {
      id: user.id,
      email: user.email,
      isSeller: user.isSeller,
      isAdmin: !!user.adminUser?.isActive,
      role: user.adminUser?.role,
      preferredLanguage: user.preferredLanguage,
    };
  }
}
