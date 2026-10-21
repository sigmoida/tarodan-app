import { redactRequestBody, redactSensitive } from "./redact-sensitive";

/**
 * Request bodies carry credentials under names that are harmless elsewhere
 * (`code`), and Sentry keeps the body as a JSON string that a key-based pass
 * cannot see into.
 */
describe("redactRequestBody", () => {
  it("masks the step-up token, passwords, provider tokens and body codes", () => {
    const redacted = redactRequestBody({
      password: "hunter2",
      newPassword: "Hunter22",
      reauthToken: "opaque-step-up",
      idToken: "eyJ-google",
      identityToken: "eyJ-apple",
      authorizationCode: "apple-code",
      code: "google-auth-code",
      provider: "google",
    });

    const text = JSON.stringify(redacted);
    for (const secret of [
      "hunter2",
      "Hunter22",
      "opaque-step-up",
      "eyJ-google",
      "eyJ-apple",
      "apple-code",
      "google-auth-code",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect((redacted as Record<string, unknown>).provider).toBe("google");
  });

  it("redacts inside a JSON string body and keeps it a string", () => {
    const redacted = redactRequestBody(
      JSON.stringify({ email: "a@b.c", password: "hunter2", code: "123456" }),
    );

    expect(typeof redacted).toBe("string");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("123456");
  });

  it("leaves a non-JSON string body to the card-number pass", () => {
    expect(redactRequestBody("merchant_oid=ABC&status=success")).toBe(
      "merchant_oid=ABC&status=success",
    );
  });

  it("does not touch a code outside a request body (error codes stay readable)", () => {
    const redacted = redactSensitive({
      code: "P2002",
      reauthToken: "opaque-step-up",
    }) as Record<string, unknown>;

    expect(redacted.code).toBe("P2002");
    expect(redacted.reauthToken).not.toBe("opaque-step-up");
  });
});
