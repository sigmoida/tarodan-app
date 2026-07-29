/** @format */

// Map next-intl's message types to the shared catalog so `useTranslations` /
// `t('...')` are type-checked against the real keys (#211).
import type { Messages } from "@tarodan/i18n";

declare global {
  type IntlMessages = Messages;
}

export {};
