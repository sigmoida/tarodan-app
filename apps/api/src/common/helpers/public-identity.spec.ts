import {
  ANONYMOUS_PUBLIC_NAME,
  publicIdentityFields,
  publicName,
  publicUsername,
  toPublicIdentity,
} from "./public-identity";

describe("public identity chain", () => {
  it("prefers the company name for corporate accounts", () => {
    expect(
      publicName({
        companyName: "Tarodan Otomotiv A.Ş.",
        username: "tarodan.oto",
        displayName: "Ayşe Yılmaz",
      }),
    ).toBe("Tarodan Otomotiv A.Ş.");
  });

  it("uses the username when one was chosen", () => {
    expect(
      publicName({
        companyName: null,
        username: "kaan.merakli",
        displayName: "Kaan İlhan",
      }),
    ).toBe("kaan.merakli");
  });

  it("falls back to the real name only for legacy accounts", () => {
    expect(
      publicName({
        companyName: null,
        username: "legacy_00000042",
        displayName: "Kaan İlhan",
      }),
    ).toBe("Kaan İlhan");
  });

  it("never returns an empty name", () => {
    expect(publicName({ username: "legacy_1", displayName: "  " })).toBe(
      ANONYMOUS_PUBLIC_NAME,
    );
    expect(publicName(null)).toBe(ANONYMOUS_PUBLIC_NAME);
  });

  it("hides the legacy placeholder from profile links", () => {
    expect(publicUsername({ username: "legacy_00000042" })).toBeNull();
    expect(publicUsername({ username: "kaan.merakli" })).toBe("kaan.merakli");
  });

  it("keeps displayName as an alias of publicName", () => {
    const fields = publicIdentityFields({
      username: "kaan.merakli",
      displayName: "Kaan İlhan",
    });
    expect(fields).toEqual({
      publicName: "kaan.merakli",
      displayName: "kaan.merakli",
      username: "kaan.merakli",
    });
  });

  it("drops the real name and company name from a row", () => {
    const row = {
      id: "u1",
      username: "legacy_9",
      displayName: "Kaan İlhan",
      companyName: null,
      avatarUrl: "a.png",
      isVerified: true,
    };
    const publicRow = toPublicIdentity(row);
    expect(publicRow).toEqual({
      id: "u1",
      publicName: "Kaan İlhan",
      displayName: "Kaan İlhan",
      username: null,
      avatarUrl: "a.png",
      isVerified: true,
    });
    expect(publicRow).not.toHaveProperty("companyName");
    expect(toPublicIdentity(null)).toBeNull();
  });
});
