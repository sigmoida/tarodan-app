import { redactSensitive } from "./redact-sensitive";

/**
 * Sign in with Apple gövdesi (`POST /auth/apple`) hata kaydına/Sentry'ye
 * düşerse belirteç ve tek kullanımlık kod DEĞER olarak görünmez (App Store
 * 5.1.1(v) için eklenen `authorizationCode` dahil).
 */
describe("redactSensitive — Sign in with Apple", () => {
  it("masks the identity token, the authorization code and the stored token", () => {
    const redacted = redactSensitive({
      identityToken: "eyJ-identity",
      authorizationCode: "c0de",
      refreshTokenEncrypted: "v1:iv:tag:ct",
      fullName: "Ali",
    }) as Record<string, unknown>;

    expect(redacted.identityToken).not.toBe("eyJ-identity");
    expect(redacted.authorizationCode).not.toBe("c0de");
    expect(redacted.refreshTokenEncrypted).not.toBe("v1:iv:tag:ct");
    expect(redacted.fullName).toBe("Ali");
  });
});
