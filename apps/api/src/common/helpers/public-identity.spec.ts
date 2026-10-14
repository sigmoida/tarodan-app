import {
  ANONYMOUS_PUBLIC_NAME,
  publicIdentityFields,
  publicName,
  publicUsername,
  toPublicIdentity,
} from "./public-identity";
import {
  ANONYMIZED_DISPLAY_NAME,
  anonymizedUsernameFor,
} from "./deleted-user-identity";

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

  it("shows a deleted account by its anonymized name, never its old handle", () => {
    const deleted = {
      companyName: null,
      username: anonymizedUsernameFor("3f2b8c1e-9d4a-4b7e-8f21-0c5d6e7a8b9c"),
      displayName: ANONYMIZED_DISPLAY_NAME,
    };
    expect(publicName(deleted)).toBe(ANONYMIZED_DISPLAY_NAME);
    expect(publicUsername(deleted)).toBeNull();
    // Üyenin seçtiği "deleted_" önekli ad yer tutucu sayılmaz.
    expect(publicUsername({ username: "deleted_fan" })).toBe("deleted_fan");
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
