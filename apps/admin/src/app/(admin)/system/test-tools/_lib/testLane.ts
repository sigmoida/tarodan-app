import { isPasswordValid } from "@tarodan/types";

export interface TestAccountDraft {
  email: string;
  password: string;
  displayName: string;
}

/**
 * Yeni test hesabı formu gönderilebilir mi. Şifre ortak politikaya uyar
 * (`@tarodan/types` password-policy) — API `@IsPassword()` ile aynısını ister.
 */
export function canCreateTestAccount(form: TestAccountDraft): boolean {
  return (
    form.email.trim().length > 3 &&
    isPasswordValid(form.password) &&
    form.displayName.trim().length >= 2
  );
}
