import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload, RequestUser } from '../interfaces';
import { PrismaService } from '../../../prisma';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('ADMIN_JWT_SECRET') || configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // Verify it's an access token and is admin
    if (payload.type !== 'access' || !payload.isAdmin) {
      throw new UnauthorizedException('Geçersiz admin token');
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
      throw new UnauthorizedException('Admin kullanıcı bulunamadı veya deaktif');
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
