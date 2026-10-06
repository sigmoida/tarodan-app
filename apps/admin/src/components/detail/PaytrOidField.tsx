"use client";

import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import { IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { paytrOidDisplay, type PaytrOidFields } from "@/lib/paytr-oid";
import { Field } from "./DataList";

/**
 * PayTR panelindeki "sipariş no" — yöneticinin PayTR satırından bizim kaydımıza
 * (ve tersine) geçtiği anahtar. Sipariş dosyası, ödeme detayı ve takas nakit
 * ödemesi aynı satırı kullanır; etiket ve kopyalama davranışı her yerde aynıdır.
 * Bir `DataList` içinde durur; gösterilecek id yoksa hiçbir şey çizmez.
 */
export function PaytrOidField(props: PaytrOidFields) {
  const t = useTranslations();
  const { copied, copy } = useCopyToClipboard();
  const display = paytrOidDisplay(props);
  if (!display) return null;
  const { current, previous } = display;

  return (
    <>
      {current && (
        <Field label={t("admin.shared.paytrOid.label")} mono>
          <span className="inline-flex items-center gap-1">
            <span className="break-all">{current}</span>
            <IconButton
              variant="ghost"
              size="xs"
              aria-label={
                copied
                  ? t("admin.shared.paytrOid.copied")
                  : t("admin.shared.paytrOid.copy")
              }
              onClick={() => void copy(current)}
            >
              {copied ? (
                <CheckIcon className="h-3.5 w-3.5 text-success-600" />
              ) : (
                <ClipboardIcon className="h-3.5 w-3.5" />
              )}
            </IconButton>
          </span>
        </Field>
      )}
      {previous.length > 0 && (
        <Field label={t("admin.shared.paytrOid.previousAttempts")}>
          <ul className="space-y-0.5 font-mono text-xs font-normal text-muted">
            {previous.map((oid) => (
              <li key={oid} className="break-all">
                {oid}
              </li>
            ))}
          </ul>
        </Field>
      )}
    </>
  );
}
