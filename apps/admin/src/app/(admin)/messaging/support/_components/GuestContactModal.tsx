"use client";

import { Modal } from "@tarodan/ui";
import { type GuestContact } from "../_lib/types";
import { useTranslations } from "next-intl";

/** Read-only detail for a guest contact message (guests aren't a routed resource). */
export function GuestContactModal({
  contact,
  onClose,
}: {
  contact: GuestContact;
  onClose: () => void;
}) {
  const t = useTranslations();
  return (
    <Modal isOpen onClose={onClose} title={contact.subject} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="min-w-0">
            <p className="text-muted">
              {t("admin.messaging.support.fullName")}
            </p>
            <p className="font-medium text-heading">{contact.name}</p>
          </div>
          <div className="min-w-0">
            <p className="text-muted">{t("common.email")}</p>
            <a
              href={`mailto:${contact.email}`}
              className="block truncate font-medium text-primary-600 hover:underline"
            >
              {contact.email}
            </a>
          </div>
          <div className="min-w-0">
            <p className="text-muted">
              {t("admin.messaging.support.reference")}
            </p>
            <p className="font-mono text-xs text-heading">
              {contact.referenceNumber}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-muted">{t("common.date")}</p>
            <p className="font-medium text-heading">
              {new Date(contact.createdAt).toLocaleString(
                t("common.dateLocale"),
              )}
            </p>
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm text-muted">{t("common.message")}</p>
          <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-alt p-4 text-body">
            {contact.message}
          </p>
        </div>
      </div>
    </Modal>
  );
}
