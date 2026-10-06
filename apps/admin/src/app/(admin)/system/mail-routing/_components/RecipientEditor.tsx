"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Input } from "@tarodan/ui";
import {
  MAX_RECIPIENTS,
  addRecipient,
  removeRecipient,
} from "../_lib/mail-routing";

/**
 * Bir alanın alıcı listesi: adres ekle / çıkar. Doğrulama `addRecipient`
 * içindedir (geçerli adres, küçük harf, tekrar yok, en çok 20); salt okurda
 * yalnız liste görünür.
 */
export function RecipientEditor({
  value,
  onChange,
  canEdit,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();

  const add = () => {
    if (draft.trim() === "") return;
    const result = addRecipient(value, draft);
    // admin `strict: false` ile derlenir; `ok` üzerinden daraltma çalışmaz.
    if ("error" in result) {
      setError(
        t(`admin.mailRouting.validation.recipient.${result.error}`, {
          max: MAX_RECIPIENTS,
        }),
      );
      return;
    }
    onChange(result.list);
    setDraft("");
    setError(undefined);
  };

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-sm text-muted">
          {t("admin.mailRouting.notificationsTab.noRecipients")}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {value.map((address) => (
            <li key={address} className="flex items-center gap-1">
              <Badge variant="outline">{address}</Badge>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(removeRecipient(value, address))}
                  aria-label={t(
                    "admin.mailRouting.notificationsTab.removeRecipient",
                    { address },
                  )}
                >
                  {t("admin.mailRouting.notificationsTab.remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Input
              type="email"
              value={draft}
              error={error}
              placeholder={t(
                "admin.mailRouting.notificationsTab.recipientPlaceholder",
              )}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
            />
          </div>
          <Button type="button" variant="outline" onClick={add}>
            {t("common.add")}
          </Button>
        </div>
      )}
    </div>
  );
}
