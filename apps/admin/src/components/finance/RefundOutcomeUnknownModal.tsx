"use client";

import { useTranslations } from "next-intl";
import { Alert, Button, Modal } from "@tarodan/ui";
import { TextLink } from "@/components/TextLink";

/** Where staff settle a refund whose PayTR outcome is not known yet. */
export const REFUND_RECONCILIATION_HREF =
  "/finance/payments?tab=reconciliation";

/**
 * Replaces a refund form once the call's outcome is unknown
 * (`isRefundOutcomeUnknown`): the money may have moved, so there is no way
 * to resubmit, only a pointer to the refund reconciliation.
 */
export function RefundOutcomeUnknownModal({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      size="md"
      closeLabel={t("common.close")}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <Alert
        variant="warning"
        action={
          <TextLink href={REFUND_RECONCILIATION_HREF}>
            {t("admin.finance.payments.refundReconciliation.action")}
          </TextLink>
        }
      >
        {t("admin.finance.payments.refundReconciliation.outcomeUnknown")}
      </Alert>
    </Modal>
  );
}
