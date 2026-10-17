import { z } from "zod";
import type { useTranslations } from "next-intl";
import { UAT_REFRESH_CONFIRM_PHRASE } from "@tarodan/types";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Canlıdan yenileme onayı: ifade birebir "STAGING" olmalı (büyük/küçük harf
 * duyarlı; yanlışlıkla tıklamayı engelleyen tek kapı budur). Doğrulama-yalnız
 * şema; API gövdesi `{ confirm, dryRun }` olarak doğrudan buradan çıkar.
 */
export const uatRefreshSchema = (t: T) =>
  z.object({
    confirm: z
      .string()
      .refine((value) => value.trim() === UAT_REFRESH_CONFIRM_PHRASE, {
        message: t("admin.system.testTools.uatRefresh.modal.confirmMismatch"),
      }),
    dryRun: z.boolean(),
  });

export type UatRefreshFormValues = z.infer<ReturnType<typeof uatRefreshSchema>>;

export const UAT_REFRESH_FORM_DEFAULTS: UatRefreshFormValues = {
  confirm: "",
  dryRun: false,
};
