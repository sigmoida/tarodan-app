import { toSignInMethods } from "./sign-in-methods.mapper";

const LINKED_AT = new Date("2026-10-01T08:00:00.000Z");

describe("toSignInMethods", () => {
  it("reports a password without exposing the hash", () => {
    const methods = toSignInMethods({
      passwordHash: "$2b$12$secret-hash",
      oauthAccounts: [],
    });

    expect(methods).toEqual({ hasPassword: true, providers: [] });
    expect(JSON.stringify(methods)).not.toContain("secret-hash");
  });

  it("lists the linked providers with their e-mail and link date", () => {
    expect(
      toSignInMethods({
        passwordHash: null,
        oauthAccounts: [
          { provider: "google", email: "a@gmail.com", createdAt: LINKED_AT },
          { provider: "apple", email: null, createdAt: LINKED_AT },
        ],
      }),
    ).toEqual({
      hasPassword: false,
      providers: [
        {
          provider: "google",
          email: "a@gmail.com",
          linkedAt: "2026-10-01T08:00:00.000Z",
        },
        {
          provider: "apple",
          email: null,
          linkedAt: "2026-10-01T08:00:00.000Z",
        },
      ],
    });
  });

  it("reads an empty hash as no password, as login and reauth do", () => {
    expect(
      toSignInMethods({ passwordHash: "", oauthAccounts: [] }).hasPassword,
    ).toBe(false);
  });

  it("leaves out rows of a provider that is not a sign-in method", () => {
    expect(
      toSignInMethods({
        passwordHash: null,
        oauthAccounts: [
          { provider: "facebook", email: "x@y.z", createdAt: LINKED_AT },
        ],
      }).providers,
    ).toEqual([]);
  });
});
