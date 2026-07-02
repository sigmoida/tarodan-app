import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';

export interface AppleProfile {
  sub: string;
  email: string;
  isPrivateEmail: boolean;
}

@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);

  constructor(private readonly configService: ConfigService) {}

  private clientId(): string {
    return this.configService.get<string>('APPLE_CLIENT_ID') || 'com.tarodan.app';
  }

  async verifyIdentityToken(identityToken: string): Promise<AppleProfile> {
    let payload: any;
    try {
      payload = await appleSignin.verifyIdToken(identityToken, {
        audience: this.clientId(),
        ignoreExpiration: false,
      });
    } catch (e) {
      this.logger.warn(`Apple token verify failed: ${e instanceof Error ? e.message : e}`);
      throw new UnauthorizedException('Apple oturumu doğrulanamadı');
    }
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Apple oturumu geçersiz');
    }
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!emailVerified) {
      throw new UnauthorizedException('Apple hesabınızın e-postası doğrulanmamış');
    }
    const isPrivate = payload.is_private_email === true || payload.is_private_email === 'true';
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      isPrivateEmail: isPrivate,
    };
  }
}
