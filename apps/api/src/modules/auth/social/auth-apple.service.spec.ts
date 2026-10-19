// apps/api/src/modules/auth/social/auth-apple.service.spec.ts
//
// SocialLoginService.loginWithApple: token handling and the login response.
// Identity -> account resolution (link, take-over, new account) is
// SocialIdentityService's and is covered in social-identity.service.spec.ts.
import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
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

describe("AuthService.loginWithApple", () => {
  let service: AuthService;
  const apple = { verifyIdentityToken: jest.fn() };
  const socialIdentity = {
    resolveUser: jest
      .fn()
      .mockResolvedValue({ userId: "u1", outcome: "existing" }),
  };
  const appleTokens = {
    storeFromAuthorizationCode: jest.fn().mockResolvedValue(undefined),
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
    refreshToken: { create: jest.fn().mockResolvedValue({ id: "rt1" }) },
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
        { provide: GoogleAuthService, useValue: { verifyIdToken: jest.fn() } },
        { provide: AppleAuthService, useValue: apple },
        { provide: AppleTokenService, useValue: appleTokens },
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

  it("resolves the verified Apple identity and answers with the login response", async () => {
    apple.verifyIdentityToken.mockResolvedValue({
      sub: "ap1",
      email: "xyz@privaterelay.appleid.com",
      isPrivateEmail: true,
    });
    prisma.user.findUnique.mockResolvedValue(baseUser);
    const res = await service.loginWithApple("tok", "Yeni Kullanıcı");
    expect(socialIdentity.resolveUser).toHaveBeenCalledWith(
      {
        provider: "apple",
        providerUserId: "ap1",
        email: "xyz@privaterelay.appleid.com",
      },
      { displayName: "Yeni Kullanıcı" },
    );
    expect(res.tokens.accessToken).toBe("tok");
  });

  // App Store 5.1.1(v): mobile 1.1.0 sends authorizationCode; the server exchanges
  // it for a refresh token with the client id used at login and stores it
  // (revoked on account deletion).
  describe("authorizationCode", () => {
    beforeEach(() => {
      apple.verifyIdentityToken.mockResolvedValue({
        sub: "ap1",
        email: "a@b.com",
        isPrivateEmail: false,
        audience: "com.tarodan.app.staging",
      });
      prisma.user.findUnique.mockResolvedValue(baseUser);
    });

    it("stores the refresh token for the signed-in client id", async () => {
      await service.loginWithApple("tok", undefined, "code-1");

      expect(appleTokens.storeFromAuthorizationCode).toHaveBeenCalledWith({
        userId: "u1",
        appleUserId: "ap1",
        clientId: "com.tarodan.app.staging",
        authorizationCode: "code-1",
      });
    });

    it("the login does not wait for Apple (exchange runs in the background)", async () => {
      // An exchange that never finishes: the login still returns.
      appleTokens.storeFromAuthorizationCode.mockReturnValueOnce(
        new Promise(() => undefined),
      );

      const res = await service.loginWithApple("tok", undefined, "code-1");

      expect(res.tokens.accessToken).toBe("tok");
      expect(appleTokens.storeFromAuthorizationCode).toHaveBeenCalled();
    });

    it("old clients without a code log in exactly as before", async () => {
      const res = await service.loginWithApple("tok");

      expect(appleTokens.storeFromAuthorizationCode).not.toHaveBeenCalled();
      expect(res.tokens.accessToken).toBe("tok");
    });

    it("does not store a token when the login itself is refused", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        deletedAt: new Date(),
      });

      await expect(
        service.loginWithApple("tok", undefined, "code-1"),
      ).rejects.toBeDefined();
      expect(appleTokens.storeFromAuthorizationCode).not.toHaveBeenCalled();
    });
  });
});
