import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthTokenService } from "./auth-token.service";
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
import { RolesGuard } from "./guards/roles.guard";
import { PhoneVerificationService } from "./verification/phone-verification.service";
import { EmailChangeService } from "./verification/email-change.service";
import { SecurityModule } from "../security/security.module";
import { MarketingModule } from "../marketing/marketing.module";

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
  ],
  controllers: [AuthController, AdminAuthController],
  providers: [
    AuthService,
    AuthTokenService,
    GoogleAuthService,
    AppleAuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    AdminJwtStrategy,
    BannedUserGuard,
    RolesGuard,
    PhoneVerificationService,
    EmailChangeService,
  ],
  exports: [AuthService, JwtModule, BannedUserGuard, RolesGuard],
})
export class AuthModule {}
