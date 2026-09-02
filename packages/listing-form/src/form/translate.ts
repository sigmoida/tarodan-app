import type { useTranslations } from "next-intl";

/**
 * next-intl'in kök çevirici tipi — `t`'yi parametre olarak alan yardımcılar
 * için. next-intl'in `t`'si anahtar-tipli genel bir fonksiyondur ve gevşek bir
 * `(key: string) => string` imzasına ATANAMAZ.
 */
export type Translate = ReturnType<typeof useTranslations<never>>;
