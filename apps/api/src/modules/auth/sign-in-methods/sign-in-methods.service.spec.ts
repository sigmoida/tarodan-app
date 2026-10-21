import { ConflictException, NotFoundException } from "@nestjs/common";
import {
  SignInMethodsService,
  toSignInMethods,
} from "./sign-in-methods.service";

const LINKED_AT = new Date("2026-10-01T08:00:00.000Z");

describe("toSignInMethods", () => {
  it("reports a password without exposing the hash", () => {
    const methods = toSignInMethods({
      passwordHash: "$2b$12$secret-hash",
      oauthAccounts: [],
    });

    expect(methods).toEqual({ hasPassword: true, providers: [] });
    expect(JSON.stringify(methods)).not.toContain("secret-hash");
  });

  it("lists the linked providers with their e-mail and link date", () => {
    expect(
      toSignInMethods({
        passwordHash: null,
        oauthAccounts: [
          { provider: "google", email: "a@gmail.com", createdAt: LINKED_AT },
          { provider: "apple", email: null, createdAt: LINKED_AT },
        ],
      }),
    ).toEqual({
      hasPassword: false,
      providers: [
        {
          provider: "google",
          email: "a@gmail.com",
          linkedAt: "2026-10-01T08:00:00.000Z",
        },
        {
          provider: "apple",
          email: null,
          linkedAt: "2026-10-01T08:00:00.000Z",
        },
      ],
    });
  });

  it("leaves out rows of a provider that is not a sign-in method", () => {
    expect(
      toSignInMethods({
        passwordHash: null,
        oauthAccounts: [
          { provider: "facebook", email: "x@y.z", createdAt: LINKED_AT },
        ],
      }).providers,
    ).toEqual([]);
  });
});

describe("SignInMethodsService", () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const passwords = { setPassword: jest.fn() };
  const sentry = { setTag: jest.fn(), addBreadcrumb: jest.fn() };
  const service = new SignInMethodsService(
    prisma as never,
    passwords as never,
    sentry as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      passwordHash: null,
      oauthAccounts: [
        { provider: "google", email: "a@gmail.com", createdAt: LINKED_AT },
      ],
    });
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
});
