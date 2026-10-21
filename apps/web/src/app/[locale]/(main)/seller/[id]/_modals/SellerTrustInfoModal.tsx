/** @format */

"use client";

import { Button, Modal } from "@tarodan/ui";
import { SELLER_TRUST_MIN_TRANSACTIONS } from "@tarodan/types";
import { useTranslations } from "next-intl";

interface SellerTrustInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FACTOR_KEYS = [
  "seller.trustScore.info.ratings",
  "seller.trustScore.info.reliability",
  "seller.trustScore.info.onTime",
  "seller.trustScore.info.volume",
  "seller.trustScore.info.tenure",
] as const;

/** Explains how the seller trust score is calculated (copy: plan section 8). */
export default function SellerTrustInfoModal({
  isOpen,
  onClose,
}: SellerTrustInfoModalProps) {
  const t = useTranslations();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("seller.trustScore.info.title")}
      size="md"
      closeLabel={t("common.close")}
      footer={
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-body">
        <p>{t("seller.trustScore.info.intro")}</p>
        <ul className="list-disc space-y-1 pl-5">
          {FACTOR_KEYS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <p>
          {t("seller.trustScore.info.newSeller", {
            count: SELLER_TRUST_MIN_TRANSACTIONS,
          })}
        </p>
        <p className="text-muted">{t("seller.trustScore.info.updated")}</p>
      </div>
    </Modal>
  );
}
