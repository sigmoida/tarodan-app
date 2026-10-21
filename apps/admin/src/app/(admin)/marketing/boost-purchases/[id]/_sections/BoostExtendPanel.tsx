"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button, Input } from "@tarodan/ui";
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";

/** The extend endpoint's day range (`ExtendBoostDto`). */
const EXTEND_MIN_DAYS = 1;
const EXTEND_MAX_DAYS = 365;
const EXTEND_DEFAULT_DAYS = 7;

/** Add days to a running or paused boost (staff only, no money moves). */
export function BoostExtendPanel({
  onExtend,
  isPending,
}: {
  onExtend: (days: number) => void;
  isPending: boolean;
}) {
  const t = useTranslations();
  const [days, setDays] = useState(EXTEND_DEFAULT_DAYS);

  return (
    <Panel className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <SectionTitle as="h2">
          {t("admin.marketing.boostPurchases.extendTitle")}
        </SectionTitle>
        <p className="mt-1 text-sm text-muted">
          {t("admin.marketing.boostPurchases.extendHelper")}
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="w-24">
          <Input
            label={t("admin.marketing.boostPurchases.days")}
            type="number"
            min={EXTEND_MIN_DAYS}
            max={EXTEND_MAX_DAYS}
            value={days}
            onChange={(event) =>
              setDays(
                Math.min(
                  EXTEND_MAX_DAYS,
                  Math.max(EXTEND_MIN_DAYS, Number(event.target.value)),
                ),
              )
            }
          />
        </div>
        <Button
          variant="primary"
          leftIcon={<ArrowPathIcon className="h-4 w-4" />}
          onClick={() => onExtend(days)}
          isLoading={isPending}
        >
          {t("admin.marketing.boostPurchases.extend")}
        </Button>
      </div>
    </Panel>
  );
}
