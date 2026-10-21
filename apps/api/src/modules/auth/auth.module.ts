import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { JwtModule } from "@nestjs/jwt";
import { QUEUE_NAMES } from "../../workers/constants";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthTokenService } from "./auth-token.service";
import { AuthRegistrationService } from "./auth-registration.service";
import { AuthPasswordService } from "./auth-password.service";
import { AuthLoginService } from "./auth-login.service";
import { SocialLoginService } from "./social/social-login.service";
import { SocialIdentityService } from "./social/social-identity.service";
import { AuthController } from "./auth.controller";
import { AdminAuthController } from "./admin-auth.controller";
import {
  JwtStrategy,
  JwtRefreshStrategy,
  AdminJwtStrategy,
} from "./strategies";
import { NotificationModule } from "../notification/notification.module";
import { CacheModule } from "../cache/cache.module";
import { StorageModule } from "../storage/storage.module";
import { BannedUserGuard } from "./guards/banned-user.guard";
import { GoogleAuthService } from "./social/google-auth.service";
import { AppleAuthService } from "./social/apple-auth.service";
import { AppleTokenModule } from "./social/apple-token.module";
import { RolesGuard } from "./guards/roles.guard";
import { PhoneVerificationService } from "./verification/phone-verification.service";
import { EmailChangeService } from "./verification/email-change.service";
import { SecurityModule } from "../security/security.module";
import { MarketingModule } from "../marketing/marketing.module";
import { ConsentModule } from "../consent/consent.module";
import { LegalIdentityModule } from "../legal-identity/legal-identity.module";
import { ReauthService } from "./reauth/reauth.service";
import { ReauthGuard } from "./reauth/reauth.guard";
import { SignInMethodsController } from "./sign-in-methods/sign-in-methods.controller";
import { SignInMethodsService } from "./sign-in-methods/sign-in-methods.service";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN") || "15m",
        },
      }),
      inject: [ConfigService],
    }),
    NotificationModule,
    CacheModule,
    StorageModule,
    SecurityModule,
    // Kayıtta pazarlama izni verilirse üye bülten listesine yazılır
    // (NewsletterService). MarketingModule Auth'a bağlı değil, döngü yok.
    MarketingModule,
    // Kayıt formundaki onaylar (terms / privacy / KVKK / pazarlama) kayıtla
    // aynı transaction'da yazılır. ConsentModule yaprak modül, döngü yok.
    ConsentModule,
    // Kayıt formundaki yasal kimlik (ad, soyad, TCKN): tekillik + hız bütçesi
    // LegalIdentityService'te. Yaprak modül, döngü yok.
    LegalIdentityModule,
    // Apple girişindeki authorizationCode → şifreli refresh token (hesap
    // silmede iptal için). Yaprak modül, döngü yok.
    AppleTokenModule,
    // Toplu aktivasyon maili kuyruğa yazılır. Bull KÖK bağlantısı global
    // (BullRootModule), bu yüzden PROCESS_ROLE=web süreci de üretici olabilir;
    // işi tüketen worker ayrı rolde koşar.
    BullModule.registerQueue({ name: QUEUE_NAMES.EMAIL }),
  ],
  controllers: [AuthController, AdminAuthController, SignInMethodsController],
  providers: [
    AuthService,
    AuthTokenService,
    AuthRegistrationService,
    AuthPasswordService,
    AuthLoginService,
    SocialLoginService,
    SocialIdentityService,
    GoogleAuthService,
    AppleAuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    AdminJwtStrategy,
    BannedUserGuard,
    RolesGuard,
    PhoneVerificationService,
    EmailChangeService,
    // Step-up (re-authentication) and the sign-in methods read model. They
    // live here, not in SecurityModule: AuthModule imports SecurityModule,
    // so the other way round would be a cycle.
    ReauthService,
    ReauthGuard,
    SignInMethodsService,
  ],
  exports: [
    AuthService,
    JwtModule,
    BannedUserGuard,
    RolesGuard,
    // `@RequireReauth()` on routes of other modules (account deletion and
    // e-mail change, plan T8b) resolves the guard and its service from here.
    ReauthService,
    ReauthGuard,
  ],
})
export class AuthModule {}
