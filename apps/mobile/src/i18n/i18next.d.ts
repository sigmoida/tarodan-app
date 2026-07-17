/**
 * #216: i18next tip augmentation — t() anahtarları @tarodan/i18n kataloğuna karşı
 * tip-denetlenir (2704 typed MessageKey, generated/keys). keySeparator '.' ile
 * nested nokta-yolu anahtarlar (t('common.login')) tanınır; yanlış anahtar tsc hatası.
 */
import type { Messages } from "@tarodan/i18n";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: Messages;
    };
    keySeparator: ".";
  }
}
