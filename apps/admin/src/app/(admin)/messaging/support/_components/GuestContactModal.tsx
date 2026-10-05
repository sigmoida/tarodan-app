"use client";

import { Modal } from "@tarodan/ui";
import { fmtDateTime } from "@/lib/format";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { TextLink } from "@/components/TextLink";
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
    <Modal isOpen onClose={onClose} title={contact.subject} size="lg">
      <div className="space-y-4">
        <DataList columns={2}>
          <Field layout="stacked" label={t("admin.messaging.support.fullName")}>
            {contact.name}
          </Field>
          <Field layout="stacked" label={t("common.email")}>
            <TextLink
              href={`mailto:${contact.email}`}
              className="block truncate"
            >
              {contact.email}
            </TextLink>
          </Field>
          <Field
            layout="stacked"
            mono
            label={t("admin.messaging.support.reference")}
          >
            {contact.referenceNumber}
          </Field>
          <Field layout="stacked" label={t("common.date")}>
            {fmtDateTime(contact.createdAt)}
          </Field>
        </DataList>
        <DataList columns={1}>
          <Field layout="stacked" label={t("common.message")}>
            <Panel
              tone="muted"
              className="whitespace-pre-wrap font-normal text-body"
            >
              {contact.message}
            </Panel>
          </Field>
        </DataList>
      </div>
    </Modal>
  );
}
