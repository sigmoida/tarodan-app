"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { TrophyIcon } from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { purchaseStatusConfig, type BoostPurchase } from "../_lib/types";
import { boostDetailActions } from "../_lib/actions";
import { useBoostActionAccess } from "../_hooks/useBoostActionAccess";
import { useBoostLifecycle } from "./_hooks/useBoostLifecycle";
import { BoostPurchaseActions } from "./_components/BoostPurchaseActions";
import { BoostSummarySection } from "./_sections/BoostSummarySection";
import { BoostPerformanceSection } from "./_sections/BoostPerformanceSection";
import { BoostExtendPanel } from "./_sections/BoostExtendPanel";
import { RefundBoostModal } from "./_modals/RefundBoostModal";
import { RevokeGrantModal } from "./_modals/RevokeGrantModal";

type OpenModal =
  { kind: "refund"; purchase: BoostPurchase } | { kind: "revoke" };

export default function BoostPurchaseDetailPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const statuses = purchaseStatusConfig(t);
  const access = useBoostActionAccess();
  const { pause, resume, extend } = useBoostLifecycle(id);
  const [modal, setModal] = useState<OpenModal | null>(null);

  return (
    <>
      <DetailPage<BoostPurchase>
        resource="boost-purchases"
        id={id}
        fetcher={(purchaseId) =>
          adminApi
            .getBoostPurchase(purchaseId)
            .then((response) => response.data)
        }
        backHref="/marketing/boost-purchases"
        emptyTitle={t("admin.marketing.boostPurchases.notFound")}
        title={(purchase) => purchase.packageName ?? "—"}
        subtitle={(purchase) =>
          `${purchase.buyer?.adminCode ?? "—"} · ${purchase.product?.title ?? "—"}`
        }
        badge={(purchase) => (
          <span className="flex items-center gap-2">
            <Badge status={purchase.status} config={statuses} />
            {purchase.isBestForBuyer && (
              <Badge variant="default">
                <TrophyIcon className="mr-1 h-4 w-4" />
                {t("admin.marketing.boostPurchases.bestBoost")}
              </Badge>
            )}
          </span>
        )}
        actions={(purchase) => (
          <BoostPurchaseActions
            actions={boostDetailActions(purchase, access)}
            onPause={() => pause.mutate()}
            onResume={() => resume.mutate()}
            onRefund={() => setModal({ kind: "refund", purchase })}
            onRevoke={() => setModal({ kind: "revoke" })}
            pausePending={pause.isPending}
            resumePending={resume.isPending}
          />
        )}
      >
        {(purchase) => (
          <div className="space-y-6">
            <BoostSummarySection purchase={purchase} />
            <BoostPerformanceSection metrics={purchase.metrics} />
            {boostDetailActions(purchase, access).extend && (
              <BoostExtendPanel
                onExtend={(days) => extend.mutate(days)}
                isPending={extend.isPending}
              />
            )}
          </div>
        )}
      </DetailPage>

      {modal?.kind === "refund" && (
        <RefundBoostModal
          purchase={modal.purchase}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "revoke" && (
        <RevokeGrantModal purchaseId={id} onClose={() => setModal(null)} />
      )}
    </>
  );
}
