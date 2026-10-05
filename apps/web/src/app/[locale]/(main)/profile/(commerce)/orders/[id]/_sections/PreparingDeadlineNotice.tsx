/** @format */

"use client";

import {
  ClockIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Alert } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/format";
import { preparingDeadlineNoticeOf } from "../_lib/preparing-deadline";
import type { OrderDetail } from "../_lib/types";

/**
 * Kargoya verme son tarihi — satıcıya "bu tarihe kadar gönder", alıcıya
 * "en geç bu tarihte yola çıkar". Süre bir kez uzatıldıysa satıcıya bunun son
 * süre olduğu, alıcıya gecikme ve kargodan önce iptal hakkı söylenir.
 */
export default function PreparingDeadlineNotice({
  order,
}: {
  order: OrderDetail;
}) {
  const t = useTranslations();
  const notice = preparingDeadlineNoticeOf(order);
  if (!notice) return null;

  const date = formatDateTime(notice.deadline);
  const sellerSide = notice.audience === "seller";

  return notice.extended ? (
    <Alert
      variant="warning"
      icon={<ExclamationTriangleIcon className="h-5 w-5 text-warning-600" />}
      title={t("order.preparingExtendedTitle", { date })}
    >
      <p>
        {sellerSide
          ? t("order.preparingExtendedSeller")
          : t("order.preparingExtendedBuyer")}
      </p>
    </Alert>
  ) : (
    <Alert
      variant="default"
      icon={<ClockIcon className="h-5 w-5 text-muted" />}
      title={t("order.preparingDeadlineTitle", { date })}
    >
      <p className="text-muted">
        {sellerSide
          ? t("order.preparingDeadlineSeller")
          : t("order.preparingDeadlineBuyer")}
      </p>
    </Alert>
  );
}
