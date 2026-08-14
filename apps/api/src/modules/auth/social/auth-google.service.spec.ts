// apps/api/src/modules/auth/auth-google.service.spec.ts
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { AuthTokenService } from "../auth-token.service";
import { AuthRegistrationService } from "../auth-registration.service";
import { AuthPasswordService } from "../auth-password.service";
import { AuthLoginService } from "../auth-login.service";
import { SocialLoginService } from "./social-login.service";
import { GoogleAuthService } from "./google-auth.service";
import { AppleAuthService } from "./apple-auth.service";
import { PrismaService } from "../../../prisma";
import { NotificationService } from "../../notification/notification.service";
import { CacheService } from "../../cache/cache.service";
import { StorageService } from "../../storage/storage.service";
import { SecurityService } from "../../security/security.service";
import { NewsletterService } from "../../marketing/newsletter.service";

describe("AuthService.loginWithGoogle", () => {
  let service: AuthService;
  const google = { verifyIdToken: jest.fn() };
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
    oAuthAccount: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: "oa1" }),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: "rt1" }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        AuthTokenService,
        AuthRegistrationService,
        AuthPasswordService,
        AuthLoginService,
        SocialLoginService,
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
        { provide: SecurityService, useValue: { validateTOTP: jest.fn() } },
        {
          provide: NewsletterService,
          useValue: { syncUserConsent: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it("logs in via existing OAuthAccount (no new user)", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
    });
    prisma.oAuthAccount.findUnique.mockResolvedValue({
      id: "oa1",
      userId: "u1",
    });
    prisma.user.findUnique.mockResolvedValue(baseUser); // buildUserAuthResponse re-query
    const res = await service.loginWithGoogle("tok");
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
    expect(res.user.email).toBe("a@b.com");
    expect(res.tokens.accessToken).toBe("tok");
  });

  it("does not let provider login bypass an enabled second factor", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
    });
    prisma.oAuthAccount.findUnique.mockResolvedValue({
      id: "oa1",
      userId: "u1",
    });
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      twoFactorSecret: { isEnabled: true },
    });

    await expect(service.loginWithGoogle("tok")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("auto-links to existing user with same email", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
    });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(baseUser); // step 2: email lookup (deletedAt:null)
    prisma.user.findUnique.mockResolvedValue(baseUser); // buildUserAuthResponse re-query
    await service.loginWithGoogle("tok");
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "google",
          providerUserId: "g1",
          userId: "u1",
        }),
      }),
    );
  });

  it("creates a new user when no account/email match", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "new@b.com",
      name: "Yeni",
      picture: "http://x/y.png",
    });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null); // step 2: email lookup → yok
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: "u2",
      email: "new@b.com",
      displayName: "Yeni",
    });
    prisma.user.create.mockResolvedValue({
      id: "u2",
      email: "new@b.com",
      isSeller: false,
    });
    await service.loginWithGoogle("tok");
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@b.com",
          passwordHash: null,
          isEmailVerified: true,
          isSeller: false,
        }),
      }),
    );
    expect(prisma.oAuthAccount.create).toHaveBeenCalled();
  });

  it("silinmiş hesaba email ile oto-bağlanmaz; yeni temiz kullanıcı oluşturur", async () => {
    // Senaryo: kullanıcı Google hesabını sildi (email serbest, OAuth koptu).
    // Eski bozuk silme kalıntısı olarak deletedAt'li satır kalmış olsa bile
    // findFirst({deletedAt:null}) onu görmez → step 3'te temiz yeni kullanıcı.
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
    });
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null); // deletedAt'li satır filtrelendi
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      id: "u3",
      email: "a@b.com",
    });
    prisma.user.create.mockResolvedValue({
      id: "u3",
      email: "a@b.com",
      isSeller: false,
    });
    await service.loginWithGoogle("tok");
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it("silinmiş satıra ait OAuthAccount eşleşse bile token vermez (buildUserAuthResponse reddi)", async () => {
    google.verifyIdToken.mockResolvedValue({
      sub: "g1",
      email: "a@b.com",
      name: "Ali",
    });
    prisma.oAuthAccount.findUnique.mockResolvedValue({
      id: "oa1",
      userId: "u1",
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
