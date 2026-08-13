import {
  generateUniqueUsernameFromEmail,
  isLegacyUsername,
  isUsernameAllowed,
  normalizeUsername,
  usernameSeedFromEmail,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from "./username.util";

describe("username rules", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeUsername("  Kaan.Merakli  ")).toBe("kaan.merakli");
  });

  it.each(["kaan", "kaan.merakli", "kaan_merakli", "k4an"])(
    "accepts %s",
    (username) => {
      expect(isUsernameAllowed(username)).toBe(true);
    },
  );

  it.each([
    "ab",
    ".kaan",
    "kaan.",
    "kaan-merakli",
    "kaan merakli",
    "admin",
    "membership",
    "a".repeat(31),
  ])("rejects %s", (username) => {
    expect(isUsernameAllowed(username)).toBe(false);
  });

  // Gösterim zinciri "legacy_" önekini "kullanıcı adı seçilmemiş" işareti olarak
  // okur; önek gerçek bir kullanıcıya verilirse zincir yalan söyler.
  it("rejects the reserved legacy prefix", () => {
    expect(isUsernameAllowed("legacy_00000042")).toBe(false);
    expect(isLegacyUsername("legacy_00000042")).toBe(true);
    expect(isLegacyUsername("kaan.merakli")).toBe(false);
    expect(isLegacyUsername(null)).toBe(true);
  });
});

describe("username generation", () => {
  it.each([
    ["Kaan.Merakli@gmail.com", "kaan.merakli"],
    ["kaan+etiket@gmail.com", "kaan.etiket"],
    ["a-b--c@firma.com.tr", "a.b.c"],
    ["ab@firma.com", "abuser"],
    ["...@firma.com", "user"],
  ])("derives a valid seed from %s", (email, expected) => {
    const seed = usernameSeedFromEmail(email);
    expect(seed).toBe(expected);
    expect(isUsernameAllowed(seed)).toBe(true);
  });

  it("uses the plain seed when it is free", async () => {
    const username = await generateUniqueUsernameFromEmail(
      "kaan@gmail.com",
      async () => false,
    );
    expect(username).toBe("kaan");
  });

  it("suffixes on collision", async () => {
    const taken = new Set(["kaan"]);
    const username = await generateUniqueUsernameFromEmail(
      "kaan@gmail.com",
      async (candidate) => taken.has(candidate),
    );
    expect(username).toBe("kaan1");
  });

  it("stays inside the pattern for long locals", async () => {
    const username = await generateUniqueUsernameFromEmail(
      `${"k".repeat(40)}@gmail.com`,
      async (candidate) => candidate === "k".repeat(USERNAME_MAX_LENGTH),
    );
    expect(username.length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH);
    expect(USERNAME_PATTERN.test(username)).toBe(true);
  });

  it("never hands out a reserved or legacy-looking name", async () => {
    const username = await generateUniqueUsernameFromEmail(
      "admin@tarodan.com",
      async () => false,
    );
    expect(isUsernameAllowed(username)).toBe(true);
    expect(username).not.toBe("admin");
  });
});
