// apps/api/src/modules/auth/google-auth.service.ts
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  private audience(): string[] {
    return [
      this.configService.get<string>('GOOGLE_CLIENT_ID_WEB'),
      this.configService.get<string>('GOOGLE_CLIENT_ID_IOS'),
      this.configService.get<string>('GOOGLE_CLIENT_ID_ANDROID'),
    ].filter((x): x is string => !!x);
  }

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    let payload: any;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audience(),
      });
      payload = ticket.getPayload();
    } catch (e) {
      this.logger.warn(`Google token verify failed: ${e instanceof Error ? e.message : e}`);
      throw new UnauthorizedException('Google oturumu doğrulanamadı');
    }
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Google oturumu geçersiz');
    }
    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Google hesabınızın e-postası doğrulanmamış');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  }
}
