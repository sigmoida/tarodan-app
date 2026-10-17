import { describe, expect, it } from "vitest";
import { LEGAL_IDENTITY_FIELDS } from "@tarodan/types";
import {
  REDACTED,
  isSensitiveKey,
  redactSensitive,
  redactString,
  redactUrlQuery,
} from "./redact";

describe("isSensitiveKey", () => {
  it("covers every legal identity field from the shared contract", () => {
    for (const field of LEGAL_IDENTITY_FIELDS) {
      expect(isSensitiveKey(field)).toBe(true);
    }
  });

  it("matches regardless of case and separators", () => {
    for (const key of [
      "IBAN",
      "tc_kimlik_no",
      "phone-number",
      "addressLine1",
      "Email",
      "Authorization",
      "set-cookie",
      "refreshToken",
      "newPassword",
      "client_secret",
      "cardNumber",
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
  });

  it("keeps ids and ordinary fields readable", () => {
    for (const key of [
      "id",
      "userId",
      "orderId",
      "addressId",
      "orderNumber",
      "status",
      "amount",
      "digest",
    ]) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });
});

describe("redactUrlQuery", () => {
  it("masks credential parameters and keeps the rest of the URL", () => {
    expect(
      redactUrlQuery("https://tarodan.test/reset-password?token=abc&lang=en"),
    ).toBe(`https://tarodan.test/reset-password?token=${REDACTED}&lang=en`);
  });

  it("masks OAuth callback codes and state", () => {
    expect(redactUrlQuery("/auth/callback?code=xyz&state=s1")).toBe(
      `/auth/callback?code=${REDACTED}&state=${REDACTED}`,
    );
  });

  it("leaves URLs without sensitive parameters untouched", () => {
    expect(redactUrlQuery("/listings?category=cars&page=2")).toBe(
      "/listings?category=cars&page=2",
    );
  });
});

describe("redactString", () => {
  it("removes a Luhn-valid card number but keeps other long numbers", () => {
    expect(redactString("card 4111 1111 1111 1111 declined")).toBe(
      `card ${REDACTED} declined`,
    );
    expect(redactString("order 1234567890123")).toBe("order 1234567890123");
  });

  it("removes a TR IBAN, grouped or not", () => {
    expect(redactString("TR330006100519786457841326")).toBe(REDACTED);
    expect(redactString("iban TR33 0006 1005 1978 6457 8413 26 ok")).toBe(
      `iban ${REDACTED} ok`,
    );
  });

  it("removes TR mobile numbers in the canonical and local forms", () => {
    expect(redactString("call +905321234567")).toBe(`call ${REDACTED}`);
    expect(redactString("call 0532 123 45 67")).toBe(`call ${REDACTED}`);
  });

  it("removes e-mail addresses", () => {
    expect(redactString("no user ali@example.com")).toBe(`no user ${REDACTED}`);
  });
});

describe("redactSensitive", () => {
  it("redacts sensitive keys at any depth and keeps ids", () => {
    const input = {
      id: "u1",
      profile: { phone: "+905321234567", address: { street: "x" } },
      list: [{ iban: "TR330006100519786457841326", orderId: "o1" }],
    };
    expect(redactSensitive(input)).toEqual({
      id: "u1",
      profile: { phone: REDACTED, address: REDACTED },
      list: [{ iban: REDACTED, orderId: "o1" }],
    });
  });

  it("does not mutate its input", () => {
    const input = { password: "p" };
    redactSensitive(input);
    expect(input.password).toBe("p");
  });

  it("stops at a fixed depth instead of recursing forever", () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 20; i += 1) deep = { next: deep };
    expect(JSON.stringify(redactSensitive(deep))).toContain("[TRUNCATED]");
  });
});
