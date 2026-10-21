// The last-method rule lives once in `@tarodan/types` (plan D1); the API
// applies it under the row lock and the clients use it for the button.
import {
  canUnlinkProvider,
  type SignInMethods,
  type SignInProvider,
} from "@tarodan/types";

const methods = (
  hasPassword: boolean,
  ...providers: SignInProvider[]
): SignInMethods => ({
  hasPassword,
  providers: providers.map((provider) => ({
    provider,
    email: null,
    linkedAt: "2026-10-01T00:00:00.000Z",
  })),
});

describe("canUnlinkProvider", () => {
  it.each<[string, SignInMethods, SignInProvider, boolean]>([
    ["password + google: google", methods(true, "google"), "google", true],
    ["password + apple: apple", methods(true, "apple"), "apple", true],
    [
      "google + apple: apple (google remains)",
      methods(false, "google", "apple"),
      "apple",
      true,
    ],
    // Apple alone does not count: Android could not sign in (ADR 0012).
    [
      "google + apple: google (only apple remains)",
      methods(false, "google", "apple"),
      "google",
      false,
    ],
    ["google only: google", methods(false, "google"), "google", false],
    ["apple only: apple", methods(false, "apple"), "apple", false],
    // Legacy data only: new writes keep one link per provider, but rows from
    // before that rule may hold two; the unlink removes both, so judge both.
    [
      "two google rows, no password",
      methods(false, "google", "google"),
      "google",
      false,
    ],
    [
      "two google rows + apple: apple",
      methods(false, "google", "google", "apple"),
      "apple",
      true,
    ],
  ])("%s -> %s", (_label, current, provider, expected) => {
    expect(canUnlinkProvider(current, provider)).toBe(expected);
  });

  it("is false for a provider that is not linked", () => {
    expect(canUnlinkProvider(methods(true, "google"), "apple")).toBe(false);
    expect(canUnlinkProvider(methods(true), "google")).toBe(false);
  });
});
