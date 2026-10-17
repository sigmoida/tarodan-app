"use client";

import { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import { Button, Modal } from "@tarodan/ui";
import { renewFailureRows, resolveErrorKey } from "../_lib/bulkRenew";
import type { RenewReport } from "../_lib/useBulkRenew";

/** Yenilenemeyen ilanlar: ilan + sunucunun döndürdüğü nedenin yerelleştirilmiş metni. */
export function BulkRenewResultModal({
  report,
  onClose,
}: {
  report: RenewReport | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const rows = report ? renewFailureRows(report.result, report.targets) : [];

  return (
    <Modal
      isOpen={!!report}
      onClose={onClose}
      size="lg"
      title={t("admin.catalog.products.bulkRenewFailedTitle")}
      description={t("admin.catalog.products.bulkRenewFailedDescription")}
      footer={
        <Button variant="primary" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-0.5 py-2">
            <span className="text-sm font-medium text-heading">
              {row.productCode ? `${row.productCode} · ` : ""}
              {row.title}
            </span>
            <span className="text-sm text-danger-600">
              {t(
                resolveErrorKey(row.errorKey, (key) =>
                  t.has(key as MessageKey),
                ) as MessageKey,
                row.errorParams,
              )}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
