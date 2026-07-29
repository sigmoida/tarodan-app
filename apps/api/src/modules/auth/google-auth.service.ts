// apps/api/src/modules/auth/google-auth.service.ts
import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import { i18nMessage } from "../i18n";

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
      this.configService.get<string>("GOOGLE_CLIENT_ID_WEB"),
      this.configService.get<string>("GOOGLE_CLIENT_ID_IOS"),
      this.configService.get<string>("GOOGLE_CLIENT_ID_ANDROID"),
    ].filter((x): x is string => !!x);
  }

  /**
   * Web auth-code flow: GSI popup'ından gelen yetki kodunu Google'ın token
   * endpoint'inde id_token ile takas eder. redirect_uri "postmessage",
   * @react-oauth/google popup auth-code akışının kullandığı sabittir.
   * Client secret gerektiği için implicit id_token akışından farklı olarak
   * GOOGLE_CLIENT_ID_WEB + GOOGLE_CLIENT_SECRET zorunludur.
   */
  async exchangeCodeForIdToken(code: string): Promise<string> {
    const clientId = this.configService.get<string>("GOOGLE_CLIENT_ID_WEB");
    const clientSecret = this.configService.get<string>("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      this.logger.error(
        "Google code exchange yapılandırılmamış: GOOGLE_CLIENT_ID_WEB / GOOGLE_CLIENT_SECRET eksik",
      );
      throw new UnauthorizedException(
        i18nMessage("server.auth.googleSessionVerifyFailed"),
      );
    }
    const client = new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri: "postmessage",
    });
    try {
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) {
        throw new Error("token yanıtında id_token yok");
      }
      return tokens.id_token;
    } catch (e) {
      this.logger.warn(
        `Google code exchange failed: ${e instanceof Error ? e.message : e}`,
      );
      throw new UnauthorizedException(
        i18nMessage("server.auth.googleSessionVerifyFailed"),
      );
    }
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
      this.logger.warn(
        `Google token verify failed: ${e instanceof Error ? e.message : e}`,
      );
      throw new UnauthorizedException(
        i18nMessage("server.auth.googleSessionVerifyFailed"),
      );
    }
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.googleSessionInvalid"),
      );
    }
    if (payload.email_verified !== true) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.googleEmailNotVerified"),
      );
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  }
}
