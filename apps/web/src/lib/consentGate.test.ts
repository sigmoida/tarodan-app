import { describe, expect, it } from "vitest";
import type { PendingConsent } from "@tarodan/types";
import {
  CONSENT_GATE_EXEMPT_PATHS,
  canSubmitConsents,
  isConsentGateExempt,
} from "./consentGate";

const pending = (document: PendingConsent["document"]): PendingConsent => ({
  document,
  version: "2026-08-04",
  reason: "missing",
  path: "/privacy",
});

describe("isConsentGateExempt", () => {
  it("onaylanacak metnin sayfası kapıdan muaftır (okunabilsin)", () => {
    expect(isConsentGateExempt("/terms")).toBe(true);
    expect(isConsentGateExempt("/privacy")).toBe(true);
  });

  it("diğer sayfalar kapının arkasındadır", () => {
    expect(isConsentGateExempt("/")).toBe(false);
    expect(isConsentGateExempt("/checkout")).toBe(false);
    // Önek eşleşmesi yol sınırına bakar.
    expect(isConsentGateExempt("/termsandmore")).toBe(false);
  });

  it("muaf liste belge kataloğundan gelir, tekrarsızdır", () => {
    expect(new Set(CONSENT_GATE_EXEMPT_PATHS).size).toBe(
      CONSENT_GATE_EXEMPT_PATHS.length,
    );
  });
});

describe("canSubmitConsents", () => {
  it("bekleyen belgelerin hepsi işaretlenmeden gönderilemez", () => {
    const list = [pending("terms"), pending("kvkk")];

    expect(canSubmitConsents(list, new Set(["terms"]))).toBe(false);
    expect(canSubmitConsents(list, new Set(["terms", "kvkk"]))).toBe(true);
  });

  it("bekleyen yoksa gönderilecek bir şey yoktur", () => {
    expect(canSubmitConsents([], new Set())).toBe(false);
  });
});
