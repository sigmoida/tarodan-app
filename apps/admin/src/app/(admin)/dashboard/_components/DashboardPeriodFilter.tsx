"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@tarodan/ui";
import {
  DASHBOARD_PERIODS,
  dashboardRangeIssue,
  isDashboardPeriod,
  type DashboardRangeIssue,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import type { DashboardPeriodSelection } from "../_lib/periodParams";

const PERIOD_LABEL_KEY: Record<string, MessageKey> = {
  daily: "admin.dashboard.period.daily",
  monthly: "admin.dashboard.period.monthly",
  custom: "admin.dashboard.period.custom",
};

const ISSUE_KEY: Record<DashboardRangeIssue, MessageKey> = {
  incomplete: "admin.dashboard.period.rangeIncomplete",
  unparseable: "admin.dashboard.period.rangeUnparseable",
  reversed: "admin.dashboard.period.rangeReversed",
};

/**
 * The dashboard's period filter: günlük / aylık / custom range.
 *
 * The two date inputs are edited as a draft and only committed once the pair
 * is valid, so the URL — and therefore the request — never carries a range the
 * API would reject; an invalid draft explains itself instead.
 */
export function DashboardPeriodFilter({
  selection,
  onChange,
}: {
  selection: DashboardPeriodSelection;
  onChange: (next: DashboardPeriodSelection) => void;
}) {
  const t = useTranslations();
  const [active, setActive] = useState(selection);
  const issue = dashboardRangeIssue(active);

  // Follow the URL when it changes from the outside (back/forward, a shared
  // link). Only valid drafts are ever written, so this never fights typing.
  useEffect(() => {
    setActive(selection);
  }, [selection.period, selection.from, selection.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (next: DashboardPeriodSelection) => {
    setActive(next);
    if (!dashboardRangeIssue(next)) onChange(next);
  };

  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      {active.period === "custom" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            bare
            type="date"
            inputSize="sm"
            aria-label={t("admin.dashboard.period.from")}
            value={active.from}
            max={active.to}
            onChange={(e) => apply({ ...active, from: e.target.value })}
            className="sm:w-40"
          />
          <span className="hidden text-muted sm:inline">–</span>
          <Input
            bare
            type="date"
            inputSize="sm"
            aria-label={t("admin.dashboard.period.to")}
            value={active.to}
            min={active.from}
            onChange={(e) => apply({ ...active, to: e.target.value })}
            className="sm:w-40"
          />
        </div>
      )}
      <Select
        bare
        selectSize="sm"
        aria-label={t("admin.dashboard.period.label")}
        value={active.period}
        onChange={(e) => {
          const period = e.target.value;
          if (isDashboardPeriod(period)) apply({ ...active, period });
        }}
        options={DASHBOARD_PERIODS.map((period) => ({
          value: period,
          label: t(PERIOD_LABEL_KEY[period]),
        }))}
        className="sm:w-40"
      />
      {issue && (
        <p role="alert" className="text-xs text-danger-600">
          {t(ISSUE_KEY[issue])}
        </p>
      )}
    </div>
  );
}
