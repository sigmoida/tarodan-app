// apps/api/src/modules/auth/google-auth.service.spec.ts
import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleAuthService } from "./google-auth.service";

describe("GoogleAuthService", () => {
  let service: GoogleAuthService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === "GOOGLE_CLIENT_ID_WEB" ? "web-client-id" : undefined,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(GoogleAuthService);
  });

  const mockTicket = (payload: any) => ({ getPayload: () => payload });

  it("returns normalized payload for a valid verified token", async () => {
    (service as any).client.verifyIdToken = jest.fn().mockResolvedValue(
      mockTicket({
        sub: "g-1",
        email: "a@b.com",
        email_verified: true,
        name: "Ali",
        picture: "http://x/y.png",
      }),
    );
    const r = await service.verifyIdToken("tok");
    expect(r).toEqual({
      sub: "g-1",
      email: "a@b.com",
      name: "Ali",
      picture: "http://x/y.png",
    });
  });

  it("rejects when email_verified is false", async () => {
    (service as any).client.verifyIdToken = jest
      .fn()
      .mockResolvedValue(
        mockTicket({ sub: "g-1", email: "a@b.com", email_verified: false }),
      );
    await expect(service.verifyIdToken("tok")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects when verifyIdToken throws (invalid token)", async () => {
    (service as any).client.verifyIdToken = jest
      .fn()
      .mockRejectedValue(new Error("bad token"));
    await expect(service.verifyIdToken("tok")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // The link route takes either client shape (web `code`, native `idToken`).
  describe("verifyProof", () => {
    const verifiedTicket = () =>
      mockTicket({ sub: "g-1", email: "a@b.com", email_verified: true });

    it("exchanges a web code and verifies the id_token Google returned", async () => {
      const exchange = jest
        .spyOn(service, "exchangeCodeForIdToken")
        .mockResolvedValue("exchanged-id-token");
      const verify = jest.fn().mockResolvedValue(verifiedTicket());
      (service as any).client.verifyIdToken = verify;

      await expect(
        service.verifyProof({ code: "web-code" }),
      ).resolves.toMatchObject({ sub: "g-1" });
      expect(exchange).toHaveBeenCalledWith("web-code");
      expect(verify).toHaveBeenCalledWith(
        expect.objectContaining({ idToken: "exchanged-id-token" }),
      );
    });

    it("verifies a native id_token without an exchange", async () => {
      const exchange = jest.spyOn(service, "exchangeCodeForIdToken");
      const verify = jest.fn().mockResolvedValue(verifiedTicket());
      (service as any).client.verifyIdToken = verify;

      await expect(
        service.verifyProof({ idToken: "native-id-token" }),
      ).resolves.toMatchObject({ sub: "g-1" });
      expect(exchange).not.toHaveBeenCalled();
      expect(verify).toHaveBeenCalledWith(
        expect.objectContaining({ idToken: "native-id-token" }),
      );
    });

    it("refuses a proof with neither a code nor an id_token", async () => {
      const verify = jest.fn();
      (service as any).client.verifyIdToken = verify;

      await expect(service.verifyProof({})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(verify).not.toHaveBeenCalled();
    });

    it("refuses a code that cannot be exchanged (not configured here)", async () => {
      const verify = jest.fn();
      (service as any).client.verifyIdToken = verify;

      await expect(
        service.verifyProof({ code: "web-code" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(verify).not.toHaveBeenCalled();
    });
  });
});
