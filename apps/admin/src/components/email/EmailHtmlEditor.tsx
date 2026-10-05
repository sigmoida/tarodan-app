"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { FormTextarea } from "@tarodan/ui/form";
import { useTranslations } from "next-intl";

/**
 * HTML e-posta gövdesi editörü (RHF alanı). E-posta şablonu düzenleyicisi ve
 * toplu bildirim formu aynı editörü kullanır: Tab girintisi, karakter sayacı,
 * koyu monospace alan. Bir `FormModal`/`Form` bağlamı içinde render edilir.
 */
export function EmailHtmlEditor({
  name,
  id = `${name}-editor`,
  placeholder,
  emptyHint,
  className = "min-h-[280px]",
}: {
  name: string;
  id?: string;
  placeholder: string;
  /** Alan boşken sayaç yerine gösterilen ipucu (ör. "boşsa varsayılan kullanılır"). */
  emptyHint?: ReactNode;
  /** Yükseklik sınıfları; varsayılan şablon düzenleyicisindeki gibi esnek. */
  className?: string;
}) {
  const t = useTranslations();
  const { setValue, control, formState } = useFormContext();
  const error = formState.errors[name]?.message as string | undefined;
  const value = (useWatch({ control, name }) as string | undefined) ?? "";

  const onTabKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setValue(
      name,
      textarea.value.substring(0, start) + "  " + textarea.value.substring(end),
      { shouldDirty: true },
    );
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    });
  };

  return (
    // `min-h-0` YOK: kısa pencerede sarmalayıcı, alanın en küçük yüksekliğinin
    // altına inip alttaki kardeşin (test e-postası satırı) üstüne taşıyordu.
    // Varsayılan en küçük yükseklik içeriktir; sığmazsa sütun kayar.
    <div className="flex flex-1 flex-col">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">
          {t("admin.marketing.emailTemplates.htmlBody")}
        </span>
        <span className="text-xs text-subtle">
          {value.length > 0
            ? t("admin.marketing.emailTemplates.characterCount", {
                count: value.length,
              })
            : emptyHint}
        </span>
      </div>
      <FormTextarea
        name={name}
        bare
        id={id}
        onKeyDown={onTabKey}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        placeholder={placeholder}
        className={`${className} flex-1 resize-none rounded-lg border border-border bg-heading p-3 font-mono text-xs leading-relaxed text-inverted`}
      />
      {error && <p className="mt-1 text-xs text-danger-500">{error}</p>}
    </div>
  );
}
