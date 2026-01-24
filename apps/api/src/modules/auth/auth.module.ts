import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AdminAuthController } from './admin-auth.controller';
import { JwtStrategy, JwtRefreshStrategy, AdminJwtStrategy } from './strategies';
import { NotificationModule } from '../notification/notification.module';
import { BannedUserGuard } from './guards/banned-user.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '15m',
        },
      }),
      inject: [ConfigService],
    }),
    NotificationModule,
  ],
  controllers: [AuthController, AdminAuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    AdminJwtStrategy,
    BannedUserGuard,
  ],
  exports: [AuthService, JwtModule, BannedUserGuard],
})
export class AuthModule {}
