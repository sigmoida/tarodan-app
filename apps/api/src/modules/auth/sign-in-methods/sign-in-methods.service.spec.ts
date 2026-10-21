import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { SignInMethodsService } from "./sign-in-methods.service";

const LINKED_AT = new Date("2026-10-01T08:00:00.000Z");

describe("SignInMethodsService", () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const passwords = { setPassword: jest.fn() };
  const sentry = { setTag: jest.fn(), addBreadcrumb: jest.fn() };
  const socialIdentity = {
    linkToUser: jest.fn(),
    unlinkFromUser: jest.fn(),
  };
  const google = { verifyProof: jest.fn() };
  const apple = { verifyIdentityToken: jest.fn() };
  const appleTokens = { storeFromAuthorizationCode: jest.fn() };
  const service = new SignInMethodsService(
    prisma as never,
    passwords as never,
    sentry as never,
    socialIdentity as never,
    google as never,
    apple as never,
    appleTokens as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      passwordHash: null,
      oauthAccounts: [
        { provider: "google", email: "a@gmail.com", createdAt: LINKED_AT },
      ],
    });
    socialIdentity.linkToUser.mockResolvedValue(undefined);
    socialIdentity.unlinkFromUser.mockResolvedValue(undefined);
    appleTokens.storeFromAuthorizationCode.mockResolvedValue(undefined);
  });

  it("reads only the session user's row", async () => {
    await service.getSignInMethods("u1");

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({
      id: "u1",
    });
  });

  it("answers 404 when the user row is gone", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getSignInMethods("u1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("sets the password, then answers the fresh read model", async () => {
    passwords.setPassword.mockResolvedValue(undefined);
    prisma.user.findUnique.mockResolvedValue({
      passwordHash: "$2b$12$new",
      oauthAccounts: [],
    });

    await expect(service.setPassword("u1", "New-Pass-1")).resolves.toEqual({
      hasPassword: true,
      providers: [],
    });
    expect(passwords.setPassword).toHaveBeenCalledWith("u1", "New-Pass-1");
    expect(sentry.setTag).toHaveBeenCalledWith("auth.flow", "password_set");
  });

  it("keeps a 409 as a breadcrumb and passes it on", async () => {
    passwords.setPassword.mockRejectedValue(new ConflictException());

    await expect(
      service.setPassword("u1", "New-Pass-1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  describe("linkGoogle", () => {
    it("links the verified Google sub to the session user, then answers the read model", async () => {
      google.verifyProof.mockResolvedValue({
        sub: "g-sub",
        email: "other@gmail.com",
      });

      await expect(
        service.linkGoogle("u1", { code: "web-code", reauthToken: "t" }),
      ).resolves.toEqual({
        hasPassword: false,
        providers: [
          {
            provider: "google",
            email: "a@gmail.com",
            linkedAt: LINKED_AT.toISOString(),
          },
        ],
      });
      expect(google.verifyProof).toHaveBeenCalledWith(
        expect.objectContaining({ code: "web-code" }),
      );
      // The provider e-mail may differ from the account e-mail (plan D3).
      expect(socialIdentity.linkToUser).toHaveBeenCalledWith("u1", {
        provider: "google",
        providerUserId: "g-sub",
        email: "other@gmail.com",
      });
      expect(sentry.setTag).toHaveBeenCalledWith("auth.flow", "provider_link");
    });

    it("turns a refused provider token into 400 PROVIDER_TOKEN_INVALID, never 401", async () => {
      google.verifyProof.mockRejectedValue(
        new UnauthorizedException({
          i18nKey: "server.auth.googleSessionVerifyFailed",
        }),
      );

      const error = await service
        .linkGoogle("u1", { idToken: "bad", reauthToken: "t" })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        i18nKey: "server.auth.googleSessionVerifyFailed",
        errorCode: "PROVIDER_TOKEN_INVALID",
      });
      expect(socialIdentity.linkToUser).not.toHaveBeenCalled();
    });

    it("passes other provider failures on unchanged", async () => {
      const outage = new InternalServerErrorException();
      google.verifyProof.mockRejectedValue(outage);

      await expect(
        service.linkGoogle("u1", { idToken: "x", reauthToken: "t" }),
      ).rejects.toBe(outage);
    });

    it("keeps a link conflict as a breadcrumb and passes it on", async () => {
      google.verifyProof.mockResolvedValue({ sub: "g-sub", email: "a@x.y" });
      socialIdentity.linkToUser.mockRejectedValue(
        new ConflictException({
          i18nKey: "server.auth.providerLinkedToOtherAccount",
          errorCode: "PROVIDER_LINKED_TO_OTHER_ACCOUNT",
        }),
      );

      await expect(
        service.linkGoogle("u1", { idToken: "x", reauthToken: "t" }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "provider_link refused: PROVIDER_LINKED_TO_OTHER_ACCOUNT",
        }),
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("linkApple", () => {
    const appleProfile = {
      sub: "a-sub",
      email: "relay@privaterelay.appleid.com",
      isPrivateEmail: true,
      audience: "com.tarodan.app",
    };

    it("links the Apple sub and stores the authorization code for revocation", async () => {
      apple.verifyIdentityToken.mockResolvedValue(appleProfile);

      await service.linkApple("u1", {
        identityToken: "id-token",
        authorizationCode: "auth-code",
        reauthToken: "t",
      });

      expect(apple.verifyIdentityToken).toHaveBeenCalledWith("id-token");
      expect(socialIdentity.linkToUser).toHaveBeenCalledWith("u1", {
        provider: "apple",
        providerUserId: "a-sub",
        email: "relay@privaterelay.appleid.com",
      });
      // Exchanged with the client id the sign-in used, as at login.
      expect(appleTokens.storeFromAuthorizationCode).toHaveBeenCalledWith({
        userId: "u1",
        appleUserId: "a-sub",
        clientId: "com.tarodan.app",
        authorizationCode: "auth-code",
      });
    });

    it("stores nothing without an authorization code (web)", async () => {
      apple.verifyIdentityToken.mockResolvedValue(appleProfile);

      await service.linkApple("u1", { identityToken: "id", reauthToken: "t" });

      expect(appleTokens.storeFromAuthorizationCode).not.toHaveBeenCalled();
    });

    it("stores nothing when the link is refused", async () => {
      apple.verifyIdentityToken.mockResolvedValue(appleProfile);
      socialIdentity.linkToUser.mockRejectedValue(new ConflictException());

      await expect(
        service.linkApple("u1", {
          identityToken: "id",
          authorizationCode: "auth-code",
          reauthToken: "t",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(appleTokens.storeFromAuthorizationCode).not.toHaveBeenCalled();
    });

    it("answers even when the background token store fails", async () => {
      apple.verifyIdentityToken.mockResolvedValue(appleProfile);
      appleTokens.storeFromAuthorizationCode.mockRejectedValue(
        new Error("apple down"),
      );

      await expect(
        service.linkApple("u1", {
          identityToken: "id",
          authorizationCode: "auth-code",
          reauthToken: "t",
        }),
      ).resolves.toHaveProperty("providers");
    });

    it("turns a refused Apple token into 400 PROVIDER_TOKEN_INVALID", async () => {
      apple.verifyIdentityToken.mockRejectedValue(
        new UnauthorizedException({
          i18nKey: "server.auth.appleSessionVerifyFailed",
        }),
      );

      await expect(
        service.linkApple("u1", { identityToken: "bad", reauthToken: "t" }),
      ).rejects.toMatchObject({
        status: 400,
        response: { errorCode: "PROVIDER_TOKEN_INVALID" },
      });
    });
  });

  describe("unlink", () => {
    it("unlinks through the identity owner, then answers the read model", async () => {
      await expect(service.unlink("u1", "apple")).resolves.toHaveProperty(
        "hasPassword",
      );
      expect(socialIdentity.unlinkFromUser).toHaveBeenCalledWith("u1", "apple");
      expect(sentry.setTag).toHaveBeenCalledWith(
        "auth.flow",
        "provider_unlink",
      );
    });

    it("keeps a refused last method as a breadcrumb, not an error", async () => {
      socialIdentity.unlinkFromUser.mockRejectedValue(
        new ConflictException({
          i18nKey: "server.auth.lastSignInMethod",
          errorCode: "LAST_SIGN_IN_METHOD",
        }),
      );

      await expect(service.unlink("u1", "google")).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "provider_unlink refused: LAST_SIGN_IN_METHOD",
          level: "info",
        }),
      );
    });
  });
});
