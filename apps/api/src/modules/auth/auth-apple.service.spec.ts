// apps/api/src/modules/auth/auth-apple.service.spec.ts
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { PrismaService } from '../../prisma';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';

describe('AuthService.loginWithApple', () => {
  let service: AuthService;
  const apple = { verifyIdentityToken: jest.fn() };
  const baseUser = {
    id: 'u1', email: 'a@b.com', phone: null, displayName: 'Ali', avatarUrl: null,
    isVerified: false, isSeller: false, sellerType: null, createdAt: new Date(),
    membership: null,
  };
  const prisma: any = {
    oAuthAccount: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'oa1' }) },
    user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn().mockResolvedValue({}) },
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
        { provide: GoogleAuthService, useValue: { verifyIdToken: jest.fn() } },
        { provide: AppleAuthService, useValue: apple },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('logs in via existing OAuthAccount (no new user)', async () => {
    apple.verifyIdentityToken.mockResolvedValue({ sub: 'ap1', email: 'a@b.com', isPrivateEmail: false });
    prisma.oAuthAccount.findUnique.mockResolvedValue({ id: 'oa1', userId: 'u1' });
    prisma.user.findUnique.mockResolvedValue(baseUser);
    const res = await service.loginWithApple('tok');
    expect(prisma.oAuthAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { provider_providerUserId: { provider: 'apple', providerUserId: 'ap1' } } }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(res.tokens.accessToken).toBe('tok');
  });

  it('auto-links to existing user with same email', async () => {
    apple.verifyIdentityToken.mockResolvedValue({ sub: 'ap1', email: 'a@b.com', isPrivateEmail: false });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(baseUser);
    prisma.user.findUnique.mockResolvedValue(baseUser);
    await service.loginWithApple('tok');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'apple', providerUserId: 'ap1', userId: 'u1' }) }),
    );
  });

  it('creates a new user (relay email) using fullName as displayName', async () => {
    apple.verifyIdentityToken.mockResolvedValue({ sub: 'ap1', email: 'xyz@privaterelay.appleid.com', isPrivateEmail: true });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, id: 'u2', email: 'xyz@privaterelay.appleid.com', displayName: 'Yeni Kullanıcı' });
    prisma.user.create.mockResolvedValue({ id: 'u2', email: 'xyz@privaterelay.appleid.com', isSeller: false });
    await service.loginWithApple('tok', 'Yeni Kullanıcı');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        email: 'xyz@privaterelay.appleid.com', passwordHash: null, isEmailVerified: true, isSeller: false, displayName: 'Yeni Kullanıcı',
      }) }),
    );
    expect(prisma.oAuthAccount.create).toHaveBeenCalled();
  });

  it('new user without fullName falls back to email prefix', async () => {
    apple.verifyIdentityToken.mockResolvedValue({ sub: 'ap1', email: 'new@b.com', isPrivateEmail: false });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, id: 'u3', email: 'new@b.com', displayName: 'new' });
    prisma.user.create.mockResolvedValue({ id: 'u3', email: 'new@b.com', isSeller: false });
    await service.loginWithApple('tok');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayName: 'new' }) }),
    );
  });
});
