// apps/api/src/modules/auth/social/auth-google.service.spec.ts
//
// SocialLoginService.loginWithGoogle: token handling and the login response.
// Identity -> account resolution (link, take-over, new account) is
// SocialIdentityService's and is covered in social-identity.service.spec.ts.
import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { AuthTokenService } from "../auth-token.service";
import { AuthRegistrationService } from "../auth-registration.service";
import { AuthPasswordService } from "../auth-password.service";
import { AuthLoginService } from "../auth-login.service";
import { SocialLoginService } from "./social-login.service";
import { SocialIdentityService } from "./social-identity.service";
import { GoogleAuthService } from "./google-auth.service";
import { AppleAuthService } from "./apple-auth.service";
import { AppleTokenService } from "./apple-token.service";
import { PrismaService } from "../../../prisma";
import { NotificationService } from "../../notification/notification.service";
import { CacheService } from "../../cache/cache.service";
import { StorageService } from "../../storage/storage.service";
import { SecurityService } from "../../security/security.service";
import { NewsletterService } from "../../marketing/newsletter.service";
import { ConsentService } from "../../consent/consent.service";
import { LegalIdentityService } from "../../legal-identity/legal-identity.service";

describe("AuthService.loginWithGoogle", () => {
  let service: AuthService;
  const google = { verifyIdToken: jest.fn() };
  const socialIdentity = {
    resolveUser: jest
      .fn()
      .mockResolvedValue({ userId: "u1", outcome: "existing" }),
  };
  const baseUser = {
    id: "u1",
    email: "a@b.com",
    phone: null,
    displayName: "Ali",
    avatarUrl: null,
    isVerified: false,
    isSeller: false,
    sellerType: null,
    createdAt: new Date(),
    membership: null,
  };
  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: "rt1" }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    socialIdentity.resolveUser.mockResolvedValue({
      userId: "u1",
      outcome: "existing",
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        AuthTokenService,
        AuthRegistrationService,
        AuthPasswordService,
        AuthLoginService,
        SocialLoginService,
        { provide: SocialIdentityService, useValue: socialIdentity },
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue("tok"),
            decode: jest
              .fn()
              .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => (k.includes("SECRET") ? "secret" : "15m"),
          },
        },
        { provide: NotificationService, useValue: {} },
        {
          provide: CacheService,
          useValue: { del: jest.fn(), set: jest.fn(), get: jest.fn() },
        },
        {
          provide: StorageService,
          useValue: { getPublicAssetUrl: jest.fn().mockReturnValue(null) },
        },
        { provide: GoogleAuthService, useValue: google },
        {
          provide: AppleAuthService,
          useValue: { verifyIdentityToken: jest.fn() },
        },
        {
          provide: AppleTokenService,
          useValue: { storeFromAuthorizationCode: jest.fn() },
        },
        { provide: SecurityService, useValue: { validateTOTP: jest.fn() } },
        {
          provide: NewsletterService,
          useValue: { syncUserConsent: jest.fn() },
        },
        {
          provide: ConsentService,
          useValue: {
            recordAccountConsents: jest.fn().mockResolvedValue(0),
            recordMarketingChange: jest.fn(),
          },
        },
        // Kayıt formundaki yasal kimlik (bu spec'in konusu değil).
        { provide: LegalIdentityService, useValue: {} },
        // AuthRegistrationService toplu aktivasyon mailini kuyruğa yazıyor.
        {
          provide: getQueueToken(QUEUE_NAMES.EMAIL),
          useValue: { add: jest.fn().mockResolvedValue({ id: "job" }) },
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it("resolves the verified Google identity and answers with the login response", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
      picture: "http://x/y.png",
    });
    prisma.user.findUnique.mockResolvedValue(baseUser); // buildUserAuthResponse re-query
    const res = await service.loginWithGoogle("tok");
    expect(socialIdentity.resolveUser).toHaveBeenCalledWith(
      { provider: "google", providerUserId: "g1", email: "a@b.com" },
      { displayName: "Ali", avatarUrl: "http://x/y.png" },
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } }),
    );
    expect(res.user.email).toBe("a@b.com");
    expect(res.tokens.accessToken).toBe("tok");
  });

  it("does not let provider login bypass an enabled second factor", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
    });
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      twoFactorSecret: { isEnabled: true },
    });

    await expect(service.loginWithGoogle("tok")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a staff (AdminUser) account with STAFF_ACCOUNT before issuing tokens", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
    });
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      adminUser: { id: "admin-1" },
    });

    await expect(service.loginWithGoogle("tok")).rejects.toMatchObject({
      response: {
        i18nKey: "server.auth.staffAccountCustomerLogin",
        errorCode: "STAFF_ACCOUNT",
      },
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it("stamps lastLoginAt/lastActivityAt like password login", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
    });
    prisma.user.findUnique.mockResolvedValue(baseUser);

    await service.loginWithGoogle("tok");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          lastLoginAt: expect.any(Date),
          lastActivityAt: expect.any(Date),
        }),
      }),
    );
  });

  it("issues no tokens for a deleted row even when a link points to it", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
    });
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      deletedAt: new Date(),
    });
    await expect(service.loginWithGoogle("tok")).rejects.toMatchObject({
      response: { i18nKey: "server.auth.accountDeleted" },
    });
  });
});
