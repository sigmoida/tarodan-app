import { isUsernameAllowed, normalizeUsername } from "./username.util";

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
});
