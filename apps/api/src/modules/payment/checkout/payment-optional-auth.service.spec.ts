import { JwtService } from "@nestjs/jwt";
import { PaymentOptionalAuthService } from "./payment-optional-auth.service";
import { extractUserAccessToken } from "../../auth/utils/user-access-token";

/**
 * İsteğe bağlı kimlikli ödeme uçlarının kullanıcı çözümü: korumalı uçlarla
 * aynı çıkarıcı + JwtStrategy hesap kuralları + ban bayrağı.
 */
describe("PaymentOptionalAuthService.resolve", () => {
  const jwt = new JwtService({ secret: "optional-auth-spec-secret" });
  const req = (headers: Record<string, string>) => ({ headers }) as never;
  const access = (sub: string) =>
    jwt.sign({ sub, type: "access" }, { expiresIn: "15m" });

  function svc(user: Record<string, unknown> | null) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          user && {
            id: "u1",
            email: "u1@test",
            isSeller: false,
            preferredLanguage: "tr",
            deletedAt: null,
            adminUser: null,
            isBanned: false,
            ...user,
          },
        ),
      },
    };
    return new PaymentOptionalAuthService(jwt, prisma as never);
  }

  it("no credentials → guest", async () => {
    await expect(svc({}).resolve(req({}))).resolves.toEqual({ kind: "guest" });
  });

  it("valid access token → user", async () => {
    await expect(
      svc({}).resolve(req({ authorization: `Bearer ${access("u1")}` })),
    ).resolves.toEqual({ kind: "user", userId: "u1" });
  });

  it("expired, unsigned, deleted, staff, banned or unknown → invalid", async () => {
    const expired = jwt.sign({
      sub: "u1",
      type: "access",
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    const bearer = (t: string) => req({ authorization: `Bearer ${t}` });
    await expect(svc({}).resolve(bearer(expired))).resolves.toEqual({
      kind: "invalid",
    });
    await expect(svc({}).resolve(bearer("garbage"))).resolves.toEqual({
      kind: "invalid",
    });
    for (const user of [
      { deletedAt: new Date() },
      { adminUser: { id: "a1" } },
      { isBanned: true },
      null,
    ]) {
      await expect(svc(user).resolve(bearer(access("u1")))).resolves.toEqual({
        kind: "invalid",
      });
    }
  });

  it("propagates infrastructure errors instead of downgrading to guest", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockRejectedValue(new Error("db down")) },
    };
    await expect(
      new PaymentOptionalAuthService(jwt, prisma as never).resolve(
        req({ authorization: `Bearer ${access("u1")}` }),
      ),
    ).rejects.toThrow("db down");
  });

  it("shares JwtStrategy's extractor: cookie first, then Bearer", () => {
    expect(
      extractUserAccessToken(
        req({
          cookie: "access_token=from-cookie",
          authorization: "Bearer from-bearer",
        }),
      ),
    ).toBe("from-cookie");
    expect(
      extractUserAccessToken(req({ authorization: "Bearer from-bearer" })),
    ).toBe("from-bearer");
  });
});
