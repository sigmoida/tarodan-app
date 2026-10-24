"use client";

import { useTranslations } from "next-intl";
import {
  ArrowUturnLeftIcon,
  NoSymbolIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import type { BoostDetailActions } from "../../_lib/actions";

/**
 * The header actions of a boost. Each one renders only when
 * `boostDetailActions` allows it, so a moderator (or staff without `ads`,
 * or without `payments` for the refund) sees none of them.
 */
export function BoostPurchaseActions({
  actions,
  onPause,
  onResume,
  onRefund,
  onRevoke,
  pausePending,
  resumePending,
}: {
  actions: BoostDetailActions;
  onPause: () => void;
  onResume: () => void;
  onRefund: () => void;
  onRevoke: () => void;
  pausePending: boolean;
  resumePending: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.pause && (
        <Button
          variant="secondary"
          leftIcon={<PauseIcon className="h-4 w-4" />}
          onClick={onPause}
          isLoading={pausePending}
        >
          {t("admin.marketing.boostPurchases.pause")}
        </Button>
      )}
      {actions.resume && (
        <Button
          variant="primary"
          leftIcon={<PlayIcon className="h-4 w-4" />}
          onClick={onResume}
          isLoading={resumePending}
        >
          {t("admin.marketing.boostPurchases.resume")}
        </Button>
      )}
      {actions.revoke && (
        <Button
          variant="danger"
          leftIcon={<NoSymbolIcon className="h-4 w-4" />}
          onClick={onRevoke}
        >
          {t("admin.marketing.boostPurchases.revoke.action")}
        </Button>
      )}
      {actions.refund && (
        <Button
          variant="danger"
          leftIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
          onClick={onRefund}
        >
          {t("admin.marketing.boostPurchases.refund.action")}
        </Button>
      )}
    </div>
  );
}
