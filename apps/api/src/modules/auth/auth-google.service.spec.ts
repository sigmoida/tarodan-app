// apps/api/src/modules/auth/auth-google.service.spec.ts
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { PrismaService } from '../../prisma';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';

describe('AuthService.loginWithGoogle', () => {
  let service: AuthService;
  const google = { verifyIdToken: jest.fn() };
  const baseUser = {
    id: 'u1', email: 'a@b.com', phone: null, displayName: 'Ali', avatarUrl: null,
    isVerified: false, isSeller: false, sellerType: null, createdAt: new Date(),
    membership: null,
  };
  const prisma: any = {
    oAuthAccount: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'oa1' }) },
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn().mockResolvedValue({}) },
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
        { provide: GoogleAuthService, useValue: google },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('logs in via existing OAuthAccount (no new user)', async () => {
    google.verifyIdToken.mockResolvedValue({ sub: 'g1', email: 'a@b.com', name: 'Ali' });
    prisma.oAuthAccount.findUnique.mockResolvedValue({ id: 'oa1', userId: 'u1' });
    prisma.user.findUnique.mockResolvedValue(baseUser); // buildUserAuthResponse re-query
    const res = await service.loginWithGoogle('tok');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
    expect(res.user.email).toBe('a@b.com');
    expect(res.tokens.accessToken).toBe('tok');
  });

  it('auto-links to existing user with same email', async () => {
    google.verifyIdToken.mockResolvedValue({ sub: 'g1', email: 'a@b.com', name: 'Ali' });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValueOnce(baseUser).mockResolvedValueOnce(baseUser);
    await service.loginWithGoogle('tok');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'google', providerUserId: 'g1', userId: 'u1' }) }),
    );
  });

  it('creates a new user when no account/email match', async () => {
    google.verifyIdToken.mockResolvedValue({ sub: 'g1', email: 'new@b.com', name: 'Yeni', picture: 'http://x/y.png' });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...baseUser, id: 'u2', email: 'new@b.com', displayName: 'Yeni' });
    prisma.user.create.mockResolvedValue({ id: 'u2', email: 'new@b.com', isSeller: false });
    await service.loginWithGoogle('tok');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'new@b.com', passwordHash: null, isEmailVerified: true, isSeller: false }) }),
    );
    expect(prisma.oAuthAccount.create).toHaveBeenCalled();
  });
});
