/** @format */

"use client";

import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/ui";
import { formatTL } from "@/lib/format";

interface PaymentDetailsCardProps {
  payment: any;
  isCompleted: boolean;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{children}</span>
    </div>
  );
}

/**
 * Ödemenin özeti. Fatura BURADA aranmaz: fiziksel sipariş teslimde faturalanır,
 * yani ödemeden hemen sonra bakmak hiçbir zaman sonuç vermiyordu. Fatura kesilince
 * alıcıya e-posta ile gider ve Siparişlerim'de durur.
 */
export default function PaymentDetailsCard({
  payment,
  isCompleted,
}: PaymentDetailsCardProps) {
  const t = useTranslations();
  return (
    <SectionCard title={t("payment.detailsTitle")} className="text-left">
      <div className="space-y-2 text-sm">
        <Row label={`${t("payment.amountLabel")}:`}>
          {formatTL(payment.amount)} TL
        </Row>
        <div className="flex justify-between">
          <span className="text-muted">{t("common.status")}:</span>
          <Badge variant={isCompleted ? "success" : "warning"}>
            {isCompleted
              ? t("order.statusCompleted")
              : t("payment.statusAwaitingConfirmation")}
          </Badge>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted">{t("payment.invoiceByEmail")}</p>
    </SectionCard>
  );
}
