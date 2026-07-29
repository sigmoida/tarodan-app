const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/;

const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "auth",
  "business",
  "corporate",
  "help",
  "login",
  "membership",
  "profile",
  "register",
  "seller",
  "support",
  "tarodan",
  "www",
]);

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function isUsernameAllowed(value: string): boolean {
  const normalized = normalizeUsername(value);
  return (
    USERNAME_PATTERN.test(normalized) && !RESERVED_USERNAMES.has(normalized)
  );
}
