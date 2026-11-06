// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));

import { membershipTierConfig } from "@tarodan/shared";
import { fmtTry } from "@/lib/format";
import { bodyText, mount, type Mounted } from "@/test-utils/dom";
import type { InstallmentSummary, InstallmentSummaryRow } from "../_lib/types";
import { InstallmentSummarySection } from "./InstallmentSummarySection";

const L = "admin.finance.overview.installments";
const COUNT = "admin.finance.installments.rules.countSingle";

const row = (
  over: Partial<InstallmentSummaryRow> = {},
): InstallmentSummaryRow => ({
  installmentCount: 3,
  segment: "guest",
  payments: 2,
  feeCollected: 108.7,
  feeRefunded: 21.74,
  feeIncomeNet: 72.47,
  platformCostExpected: 0,
  platformCostBooked: 0,
  ...over,
});

const summary: InstallmentSummary = {
  rows: [
    row(),
    row({
      installmentCount: 6,
      segment: "premium",
      payments: 1,
      feeCollected: 0,
      feeRefunded: 0,
      feeIncomeNet: 0,
      platformCostExpected: 62.4,
      platformCostBooked: 61.9,
    }),
  ],
  totals: {
    payments: 3,
    feeCollected: 108.7,
    feeRefunded: 21.74,
    feeIncomeNet: 72.47,
    platformCostExpected: 62.4,
    platformCostBooked: 61.9,
  },
};

class NoopResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

let view: Mounted | undefined;
// The table's truncating cells watch their width.
beforeEach(() => vi.stubGlobal("ResizeObserver", NoopResizeObserver));
afterEach(() => {
  vi.unstubAllGlobals();
  view?.unmount();
  view = undefined;
});

const tableRows = () =>
  [...document.body.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent ?? ""),
  );

describe("InstallmentSummarySection", () => {
  it("lists one row per count × segment with the fee and cost columns", () => {
    view = mount(<InstallmentSummarySection summary={summary} syncEnabled />);

    const headers = [...document.body.querySelectorAll("thead th")].map(
      (th) => th.textContent,
    );
    expect(headers).toEqual([
      "admin.finance.installments.preview.columns.count",
      "admin.finance.installments.rules.columns.segment",
      `${L}.columns.payments`,
      `${L}.columns.feeCollected`,
      `${L}.columns.feeRefunded`,
      "admin.finance.overview.sections.platformNet.lines.installmentFeeIncome",
      "admin.finance.payments.installment.platformCost",
      `${L}.columns.platformCostBooked`,
    ]);
    expect(tableRows()).toEqual([
      [
        `${COUNT}|${JSON.stringify({ count: 3 })}`,
        "admin.finance.installments.segments.guest",
        "2",
        fmtTry(108.7),
        fmtTry(21.74),
        fmtTry(72.47),
        fmtTry(0),
        fmtTry(0),
      ],
      [
        `${COUNT}|${JSON.stringify({ count: 6 })}`,
        membershipTierConfig.premium.labelKey,
        "1",
        fmtTry(0),
        fmtTry(0),
        fmtTry(0),
        fmtTry(62.4),
        fmtTry(61.9),
      ],
    ]);
  });

  it("adds a totals row under the columns", () => {
    view = mount(<InstallmentSummarySection summary={summary} syncEnabled />);

    const cells = [...document.body.querySelectorAll("tfoot tr td")].map(
      (td) => td.textContent,
    );
    expect(cells).toEqual([
      "common.total",
      "",
      "3",
      fmtTry(108.7),
      fmtTry(21.74),
      fmtTry(72.47),
      fmtTry(62.4),
      fmtTry(61.9),
    ]);
  });

  it("shows the empty state without a totals row when there are no installment payments", () => {
    view = mount(
      <InstallmentSummarySection
        summary={{
          rows: [],
          totals: {
            payments: 0,
            feeCollected: 0,
            feeRefunded: 0,
            feeIncomeNet: 0,
            platformCostExpected: 0,
            platformCostBooked: 0,
          },
        }}
        syncEnabled
      />,
    );

    expect(bodyText()).toContain(`${L}.title`);
    expect(bodyText()).toContain(`${L}.empty`);
    expect(document.body.querySelector("table")).toBeNull();
  });

  it("flags the booked cost as sync-dependent when the PayTR sync is off", () => {
    view = mount(
      <InstallmentSummarySection summary={summary} syncEnabled={false} />,
    );
    expect(bodyText()).toContain("admin.finance.overview.syncOff");
    expect(bodyText()).not.toContain("admin.finance.overview.scope.allTime");
  });
});
