"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Input, Select } from "@tarodan/ui";
import {
  ANALYTICS_GROUP_BYS,
  analyticsRangeIssue,
  isAnalyticsGroupBy,
  type AnalyticsRangeIssue,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import type { AnalyticsRangeSelection } from "../_lib/rangeParams";

const GROUP_BY_LABEL: Record<string, MessageKey> = {
  day: "admin.analytics.filters.day",
  week: "admin.analytics.filters.week",
  month: "admin.analytics.filters.month",
};

const ISSUE_KEY: Record<AnalyticsRangeIssue, MessageKey> = {
  incomplete: "admin.analytics.filters.rangeIncomplete",
  unparseable: "admin.analytics.filters.rangeUnparseable",
  reversed: "admin.analytics.filters.rangeReversed",
  tooLong: "admin.analytics.filters.rangeTooLong",
};

/**
 * The controls EVERY tab shares: the window, the bucket size, and whether to
 * measure the window before it.
 *
 * The pair of dates is edited as a draft and only committed once it is valid,
 * so the URL — and therefore the request — never carries a range the API would
 * reject; an invalid draft explains itself instead. Same contract as the
 * dashboard's period filter, and the same shared rule decides.
 */
export function AnalyticsFilters({
  selection,
  onChange,
}: {
  selection: AnalyticsRangeSelection;
  onChange: (next: AnalyticsRangeSelection) => void;
}) {
  const t = useTranslations();
  const [draft, setDraft] = useState(selection);
  const issue = analyticsRangeIssue(draft);

  // Follow the URL when it changes from the outside (back/forward, a shared
  // link). Only valid drafts are ever written, so this never fights typing.
  useEffect(() => {
    setDraft(selection);
  }, [selection.from, selection.to, selection.groupBy, selection.compare]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (next: AnalyticsRangeSelection) => {
    setDraft(next);
    if (!analyticsRangeIssue(next)) onChange(next);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          bare
          type="date"
          inputSize="sm"
          aria-label={t("admin.analytics.filters.from")}
          value={draft.from}
          max={draft.to}
          onChange={(e) => apply({ ...draft, from: e.target.value })}
          className="sm:w-40"
        />
        <span className="hidden text-muted sm:inline">–</span>
        <Input
          bare
          type="date"
          inputSize="sm"
          aria-label={t("admin.analytics.filters.to")}
          value={draft.to}
          min={draft.from}
          onChange={(e) => apply({ ...draft, to: e.target.value })}
          className="sm:w-40"
        />
      </div>

      <Select
        bare
        selectSize="sm"
        aria-label={t("admin.analytics.filters.groupBy")}
        value={draft.groupBy}
        onChange={(e) => {
          const groupBy = e.target.value;
          if (isAnalyticsGroupBy(groupBy)) apply({ ...draft, groupBy });
        }}
        options={ANALYTICS_GROUP_BYS.map((groupBy) => ({
          value: groupBy,
          label: t(GROUP_BY_LABEL[groupBy]),
        }))}
        className="sm:w-36"
      />

      <Checkbox
        size="sm"
        label={t("admin.analytics.filters.compare")}
        checked={draft.compare}
        onChange={(e) => apply({ ...draft, compare: e.target.checked })}
      />

      {issue && (
        <p role="alert" className="text-xs text-danger-600">
          {t(ISSUE_KEY[issue])}
        </p>
      )}
    </div>
  );
}
