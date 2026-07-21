// apps/api/src/modules/auth/auth-password-login.spec.ts
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { PrismaService } from '../../prisma';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';

describe('AuthService.login - password login edge cases', () => {
  let service: AuthService;

  const prisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    securityLog: { create: jest.fn().mockResolvedValue({}) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('tok') } },
        { provide: ConfigService, useValue: { get: (k: string) => (k.includes('SECRET') ? 'secret' : '15m') } },
        { provide: NotificationService, useValue: {} },
        { provide: CacheService, useValue: { del: jest.fn(), set: jest.fn(), get: jest.fn() } },
        { provide: StorageService, useValue: { getPublicAssetUrl: jest.fn().mockReturnValue(null) } },
        { provide: GoogleAuthService, useValue: {} },
        { provide: AppleAuthService, useValue: { verifyIdentityToken: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('should throw UnauthorizedException when user has no passwordHash (OAuth-only)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'oauth@example.com',
      passwordHash: null,
      isEmailVerified: true,
      isSeller: false,
      sellerType: null,
      displayName: 'OAuth User',
      avatarUrl: null,
      phone: null,
      isVerified: false,
      createdAt: new Date(),
      membership: null,
    });

    await expect(
      service.login({ email: 'oauth@example.com', password: 'anypassword' }),
    ).rejects.toThrow(UnauthorizedException);

    // Ensure a security event was logged with the correct reason
    expect(prisma.securityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'failed_login', details: expect.objectContaining({ reason: 'oauth_only_account' }) }),
      }),
    );
  });

  it('should expose EMAIL_NOT_VERIFIED for a valid password on an unverified account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u2',
      email: 'unverified@example.com',
      passwordHash: await bcrypt.hash('CorrectPass123!', 4),
      isEmailVerified: false,
      isSeller: false,
      sellerType: null,
      displayName: 'Unverified User',
      avatarUrl: null,
      phone: null,
      isVerified: false,
      createdAt: new Date(),
      membership: null,
    });

    try {
      await service.login({
        email: 'unverified@example.com',
        password: 'CorrectPass123!',
      });
      throw new Error('Expected login to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toEqual(
        expect.objectContaining({
          errorCode: 'EMAIL_NOT_VERIFIED',
          i18nKey: 'server.auth.emailNotVerifiedLogin',
        }),
      );
    }
  });
});
