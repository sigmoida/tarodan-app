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

  it("redacts a form body by key and keeps the other fields", () => {
    expect(
      redactRequestBody(
        "merchant_oid=ABC&password=hunter2&code=123456&status=success",
      ),
    ).toBe("merchant_oid=ABC&password=***&code=***&status=success");
  });

  describe("a string that is neither valid JSON nor a form body", () => {
    it("masks the credentials of a truncated JSON body and keeps the rest", () => {
      expect(
        redactRequestBody('{"password":"hunter2","otp": 123456,"email":"a@b.c'),
      ).toBe('{"password":"[REDACTED]","otp": "[REDACTED]","email":"a@b.c');
    });

    it("masks a value cut off inside its string", () => {
      expect(redactRequestBody('{"email":"a@b.c","password":"hunt')).toBe(
        '{"email":"a@b.c","password":"[REDACTED]"',
      );
    });

    it("masks a nested credential key and a body code", () => {
      const redacted = redactRequestBody(
        '{"user":{"currentPassword":"hunter2","code":"654321"},"provider":"go',
      );

      expect(redacted).toBe(
        '{"user":{"currentPassword":"[REDACTED]","code":"[REDACTED]"},"provider":"go',
      );
    });

    it("drops the whole string when a credential holds an object or array", () => {
      expect(
        redactRequestBody('{"card":{"number":"4111","holder":"A B"},"x":'),
      ).toBe("[REDACTED]");
    });

    it("drops the whole string when a key has escapes a parser would decode", () => {
      expect(redactRequestBody('{"pass\\u0077ord":"hunter2",')).toBe(
        "[REDACTED]",
      );
    });

    it("keeps a plain string without credentials as it is", () => {
      expect(redactRequestBody("not json, not a form")).toBe(
        "not json, not a form",
      );
      expect(redactRequestBody('{"email":"a@b.c","items":[1,2')).toBe(
        '{"email":"a@b.c","items":[1,2',
      );
    });
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
