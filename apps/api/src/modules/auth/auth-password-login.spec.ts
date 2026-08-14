// apps/api/src/modules/auth/auth-password-login.spec.ts
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { GoogleAuthService } from "./social/google-auth.service";
import { AppleAuthService } from "./social/apple-auth.service";
import { PrismaService } from "../../prisma";
import { NotificationService } from "../notification/notification.service";
import { CacheService } from "../cache/cache.service";
import { StorageService } from "../storage/storage.service";
import { SecurityService } from "../security/security.service";
import { NewsletterService } from "../marketing/newsletter.service";

describe("AuthService.login - password login edge cases", () => {
  let service: AuthService;

  const prisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    securityLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const security = { validateTOTP: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue("tok") },
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
        { provide: GoogleAuthService, useValue: {} },
        {
          provide: AppleAuthService,
          useValue: { verifyIdentityToken: jest.fn() },
        },
        { provide: SecurityService, useValue: security },
        {
          provide: NewsletterService,
          useValue: { syncUserConsent: jest.fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it("should throw UnauthorizedException when user has no passwordHash (OAuth-only)", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "oauth@example.com",
      passwordHash: null,
      isEmailVerified: true,
      isSeller: false,
      sellerType: null,
      displayName: "OAuth User",
      avatarUrl: null,
      phone: null,
      isVerified: false,
      createdAt: new Date(),
      membership: null,
    });

    await expect(
      service.login({ email: "oauth@example.com", password: "anypassword" }),
    ).rejects.toThrow(UnauthorizedException);

    // Ensure a security event was logged with the correct reason
    expect(prisma.securityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "failed_login",
          details: expect.objectContaining({ reason: "oauth_only_account" }),
        }),
      }),
    );
  });

  it("should expose EMAIL_NOT_VERIFIED for a valid password on an unverified account", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u2",
      email: "unverified@example.com",
      passwordHash: await bcrypt.hash("CorrectPass123!", 4),
      isEmailVerified: false,
      isSeller: false,
      sellerType: null,
      displayName: "Unverified User",
      avatarUrl: null,
      phone: null,
      isVerified: false,
      createdAt: new Date(),
      membership: null,
    });

    try {
      await service.login({
        email: "unverified@example.com",
        password: "CorrectPass123!",
      });
      throw new Error("Expected login to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toEqual(
        expect.objectContaining({
          errorCode: "EMAIL_NOT_VERIFIED",
          i18nKey: "server.auth.emailNotVerifiedLogin",
        }),
      );
    }
  });

  it("rejects a banned account before issuing tokens", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u-banned",
      email: "banned@example.com",
      passwordHash: await bcrypt.hash("CorrectPass123!", 4),
      isEmailVerified: true,
      isBanned: true,
      deletedAt: null,
      isSeller: false,
      sellerType: null,
      displayName: "Banned User",
      avatarUrl: null,
      phone: null,
      isVerified: false,
      createdAt: new Date(),
      membership: null,
      twoFactorSecret: null,
    });

    await expect(
      service.login({
        email: "banned@example.com",
        password: "CorrectPass123!",
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns a tokenless challenge when an enabled second factor is missing", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u3",
      email: "2fa@example.com",
      passwordHash: await bcrypt.hash("CorrectPass123!", 4),
      isEmailVerified: true,
      isSeller: false,
      sellerType: null,
      displayName: "2FA User",
      avatarUrl: null,
      phone: null,
      isVerified: false,
      createdAt: new Date(),
      membership: null,
      twoFactorSecret: { isEnabled: true },
    });

    await expect(
      service.login({
        email: "2fa@example.com",
        password: "CorrectPass123!",
      }),
    ).resolves.toEqual({ requires2FA: true });
    expect(security.validateTOTP).not.toHaveBeenCalled();
  });

  it("rejects an invalid second factor after a valid password", async () => {
    security.validateTOTP.mockResolvedValue(false);
    prisma.user.findUnique.mockResolvedValue({
      id: "u4",
      email: "2fa-invalid@example.com",
      passwordHash: await bcrypt.hash("CorrectPass123!", 4),
      isEmailVerified: true,
      isSeller: false,
      sellerType: null,
      displayName: "2FA User",
      avatarUrl: null,
      phone: null,
      isVerified: false,
      createdAt: new Date(),
      membership: null,
      twoFactorSecret: { isEnabled: true },
    });

    await expect(
      service.login({
        email: "2fa-invalid@example.com",
        password: "CorrectPass123!",
        twoFactorCode: "123456",
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(security.validateTOTP).toHaveBeenCalledWith("u4", "123456");
  });
});
