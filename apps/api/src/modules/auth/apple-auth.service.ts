import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';
import { i18nMessage } from '../i18n';

export interface AppleProfile {
  sub: string;
  email: string;
  isPrivateEmail: boolean;
}

@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);

  constructor(private readonly configService: ConfigService) {}

  private audience(): string[] {
    const list = [
      this.configService.get<string>('APPLE_CLIENT_ID'),
      this.configService.get<string>('APPLE_SERVICES_ID'),
    ].filter((x): x is string => !!x);
    return list.length ? list : ['com.tarodan.app'];
  }

  async verifyIdentityToken(identityToken: string): Promise<AppleProfile> {
    let payload: any;
    try {
      payload = await appleSignin.verifyIdToken(identityToken, {
        audience: this.audience(),
        ignoreExpiration: false,
      });
    } catch (e) {
      this.logger.warn(`Apple token verify failed: ${e instanceof Error ? e.message : e}`);
      throw new UnauthorizedException(i18nMessage('server.auth.appleSessionVerifyFailed'));
    }
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException(i18nMessage('server.auth.appleSessionInvalid'));
    }
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!emailVerified) {
      throw new UnauthorizedException(i18nMessage('server.auth.appleEmailNotVerified'));
    }
    const isPrivate = payload.is_private_email === true || payload.is_private_email === 'true';
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      isPrivateEmail: isPrivate,
    };
  }
}
