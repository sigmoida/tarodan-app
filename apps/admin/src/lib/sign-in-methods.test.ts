import { describe, expect, it } from "vitest";
import { getMessages, type MessageKey } from "@tarodan/i18n";
import {
  REAUTH_METHODS,
  SIGN_IN_METHOD_EVENT_SOURCES,
  SIGN_IN_METHOD_EVENT_TYPES,
  SIGN_IN_PROVIDERS,
} from "@tarodan/types";
import type { Translate } from "./statusLabels";
import {
  reauthMethodLabel,
  signInMethodEventLabels,
  signInMethodEventProviderLabel,
  signInMethodSourceLabels,
} from "./sign-in-methods";

/** Echoes the key, so a test can check which catalog key a label uses. */
const t = ((key: string) => key) as unknown as Translate;

/** The catalog text of a dotted key, or undefined when the key is missing. */
function lookup(locale: "tr" | "en", key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      getMessages(locale),
    );
}

function expectCatalogText(key: string) {
  for (const locale of ["tr", "en"] as const) {
    const text = lookup(locale, key);
    expect(typeof text, `${locale}: ${key}`).toBe("string");
    expect((text as string).length, `${locale}: ${key}`).toBeGreaterThan(0);
  }
}

describe("signInMethodEventLabels", () => {
  it("labels every sign-in method event with its own catalog key", () => {
    const labels = signInMethodEventLabels(t);
    const keys = SIGN_IN_METHOD_EVENT_TYPES.map((type) => labels[type]);

    expect(Object.keys(labels).sort()).toEqual(
      [...SIGN_IN_METHOD_EVENT_TYPES].sort(),
    );
    expect(new Set(keys).size).toBe(SIGN_IN_METHOD_EVENT_TYPES.length);
    keys.forEach(expectCatalogText);
  });
});

describe("signInMethodSourceLabels", () => {
  it("labels both sources from the catalog", () => {
    const labels = signInMethodSourceLabels(t);

    expect(labels).toEqual({
      [SIGN_IN_METHOD_EVENT_SOURCES.manual]:
        "admin.users.signInMethods.sourceManual" satisfies MessageKey,
      [SIGN_IN_METHOD_EVENT_SOURCES.login]:
        "admin.users.signInMethods.sourceLogin" satisfies MessageKey,
    });
    Object.values(labels).forEach(expectCatalogText);
  });
});

describe("reauthMethodLabel", () => {
  it("names the password from the catalog and a provider by its brand", () => {
    expect(
      REAUTH_METHODS.map((method) => reauthMethodLabel(method, t)),
    ).toEqual(["admin.users.signInMethods.password", "Google", "Apple"]);
  });
});

describe("signInMethodEventProviderLabel", () => {
  it("shows the provider of a provider event", () => {
    for (const provider of SIGN_IN_PROVIDERS) {
      expect(
        signInMethodEventProviderLabel({ provider, method: null }, t),
      ).toBe(provider === "google" ? "Google" : "Apple");
    }
  });

  it("falls back to the step-up proof when the provider is null", () => {
    expect(
      signInMethodEventProviderLabel({ provider: null, method: "password" }, t),
    ).toBe("admin.users.signInMethods.password");
    expect(
      signInMethodEventProviderLabel({ provider: null, method: "apple" }, t),
    ).toBe("Apple");
  });

  it("is null when the event names neither (password set)", () => {
    expect(
      signInMethodEventProviderLabel({ provider: null, method: null }, t),
    ).toBeNull();
  });
});
