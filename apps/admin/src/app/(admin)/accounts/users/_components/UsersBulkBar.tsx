"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { ResourceList, useResourceList } from "@/components/list";
import type { User } from "../_lib/types";
import { eligibleIds, type UserAccountAction } from "../_lib/bulkEligibility";
import { ACTION_LABEL_KEY, useUserActions } from "../_lib/useUserActions";

const BULK_ACTIONS: Array<{
  action: UserAccountAction;
  variant: "outline" | "success" | "danger";
}> = [
  { action: "resend", variant: "outline" },
  { action: "verify", variant: "outline" },
  { action: "unban", variant: "success" },
  { action: "ban", variant: "danger" },
  // Yalnız hiç giriş yapmamış hesaplar; diğerleri sayılmaz ve atlanır.
  { action: "delete", variant: "danger" },
];

/**
 * Seçim barı: her buton, seçimde kendine uygun kaç satır olduğunu gösterir;
 * uygun satır yoksa kapalıdır. Gönderim onaylanınca seçim temizlenir.
 */
export function UsersBulkBar() {
  const t = useTranslations();
  const { rows, selection } = useResourceList<User>();
  const { runBulk, isBulkPending } = useUserActions();

  const selected = new Set(selection.selectedIds);
  const selectedRows = rows.filter((row) => selected.has(row.id));

  return (
    <ResourceList.BulkBar>
      {BULK_ACTIONS.map(({ action, variant }) => {
        const count = eligibleIds(action, selectedRows).length;
        return (
          <Button
            key={action}
            size="sm"
            variant={variant}
            disabled={count === 0 || isBulkPending}
            onClick={async () => {
              if (await runBulk(action, selectedRows)) selection.clear();
            }}
          >
            {t(ACTION_LABEL_KEY[action])} ({count})
          </Button>
        );
      })}
    </ResourceList.BulkBar>
  );
}
