/** @format */

"use client";

import { useTranslations } from "next-intl";
import { ArrowUturnLeftIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { AdminTabs } from "@/components/AdminTabs";
import { CANCELLATION_REFUND_VIEWS } from "./_lib/view";
import { useCancellationRefundView } from "./_hooks/useCancellationRefundView";
import { CancellationsView } from "./_components/CancellationsView";
import { RefundsView } from "./_components/RefundsView";

const VIEW_ICONS = {
  cancellations: XCircleIcon,
  refunds: ArrowUturnLeftIcon,
} as const;

const VIEW_I18N_KEYS = {
  cancellations: "admin.operations.cancellations.views.cancellations",
  refunds: "admin.operations.cancellations.views.refunds",
} as const;

/**
 * İptal & İade: iki üst sekme. İptaller, iptal edilen sepet / teklif
 * siparişi / takasları aktöre göre ayırır; İadeler, iade taleplerinin
 * listesidir (eski `/operations/refund-requests`). Yalnız etkin sekme bağlanır.
 */
export default function CancellationsRefundsPage() {
  const t = useTranslations();
  const { view, setView } = useCancellationRefundView();

  return (
    <AdminPage>
      <PageHeader
        title={t("admin.operations.cancellations.title")}
        description={t("admin.operations.cancellations.description")}
      />
      <AdminTabs
        tabs={CANCELLATION_REFUND_VIEWS.map((key) => ({
          key,
          label: t(VIEW_I18N_KEYS[key]),
          icon: VIEW_ICONS[key],
        }))}
        value={view}
        onChange={setView}
      />
      {view === "cancellations" ? <CancellationsView /> : <RefundsView />}
    </AdminPage>
  );
}
