/** @format */

import type { useTranslations } from "next-intl";

/**
 * next-intl's root translator type — for helpers/components that receive `t` as
 * a parameter (e.g. status-map builders). next-intl's `t` is a generic keyed
 * function and is NOT assignable to a loose `(key: string) => string`, so shared
 * helpers must use this type. Internal `t('...')` calls stay key-checked (#211).
 */
export type Translate = ReturnType<typeof useTranslations<never>>;
