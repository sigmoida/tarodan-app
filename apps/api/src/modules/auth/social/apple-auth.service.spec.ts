import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import appleSignin from "apple-signin-auth";
import { AppleAuthService } from "./apple-auth.service";

jest.mock("apple-signin-auth");

describe("AppleAuthService", () => {
  let service: AppleAuthService;
  const verify = appleSignin.verifyIdToken as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AppleAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === "APPLE_CLIENT_ID"
                ? "com.tarodan.app"
                : k === "APPLE_SERVICES_ID"
                  ? "shop.tarodan.web"
                  : undefined,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(AppleAuthService);
  });

  it("returns normalized profile for a valid token (real email)", async () => {
    verify.mockResolvedValue({
      sub: "a-1",
      email: "a@b.com",
      email_verified: "true",
      is_private_email: "false",
    });
    const r = await service.verifyIdentityToken("tok");
    expect(verify).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({
        audience: ["com.tarodan.app", "shop.tarodan.web"],
      }),
    );
    expect(r).toEqual({ sub: "a-1", email: "a@b.com", isPrivateEmail: false });
  });

  it("accepts relay (private) email", async () => {
    verify.mockResolvedValue({
      sub: "a-2",
      email: "xyz@privaterelay.appleid.com",
      email_verified: true,
      is_private_email: true,
    });
    const r = await service.verifyIdentityToken("tok");
    expect(r).toEqual({
      sub: "a-2",
      email: "xyz@privaterelay.appleid.com",
      isPrivateEmail: true,
    });
  });

  it("rejects when token has no sub or email", async () => {
    verify.mockResolvedValue({ sub: "a-3" });
    await expect(service.verifyIdentityToken("tok")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects when email is not verified", async () => {
    verify.mockResolvedValue({
      sub: "a-4",
      email: "a@b.com",
      email_verified: false,
    });
    await expect(service.verifyIdentityToken("tok")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects when verifyIdToken throws (invalid/expired token)", async () => {
    verify.mockRejectedValue(new Error("jwt expired"));
    await expect(service.verifyIdentityToken("tok")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("passes both native and web audiences (accepts a web Services ID token)", async () => {
    verify.mockResolvedValue({
      sub: "w-1",
      email: "w@b.com",
      email_verified: true,
      is_private_email: false,
    });
    const r = await service.verifyIdentityToken("tok");
    expect(verify).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({
        audience: ["com.tarodan.app", "shop.tarodan.web"],
      }),
    );
    expect(r.sub).toBe("w-1");
  });
});
