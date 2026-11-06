// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import { fmtTry } from "@/lib/format";
import { mount, type Mounted } from "@/test-utils/dom";
import type { ReconciliationSection } from "../_lib/types";
import { ReconciliationSectionView } from "./ReconciliationSection";

const S = "admin.finance.overview.sections";

let view: Mounted | undefined;
afterEach(() => {
  view?.unmount();
  view = undefined;
});

/** The component rows as `label = amount`. */
const lines = () =>
  [...document.body.querySelectorAll(".divide-y > div")].map((row) => {
    const [label, amount] = [...row.children].map((c) => c.textContent ?? "");
    return `${label} = ${amount}`;
  });

const render = (section: ReconciliationSection, syncEnabled = true) => {
  view = mount(
    <ReconciliationSectionView
      section={section}
      syncEnabled={syncEnabled}
      loading={false}
    />,
  );
};

describe("ReconciliationSectionView installment lines (ADR 0019)", () => {
  it("shows the installment fee the buyers paid in the revenue split", () => {
    render({
      key: "revenueSplit",
      kind: "identity",
      scope: "allTime",
      total: { key: "collected", amount: 1054.35, count: 1 },
      components: [
        { key: "sellerShare", amount: 1000 },
        { key: "installmentFee", amount: 54.35 },
      ],
      difference: 0,
      balanced: true,
    });

    expect(lines()).toContain(
      `${S}.revenueSplit.lines.installmentFee = ${fmtTry(54.35)}`,
    );
  });

  it("adds the fee income and subtracts the campaign cost in the platform waterfall", () => {
    render(
      {
        key: "platformNet",
        kind: "waterfall",
        scope: "allTime",
        total: { key: "platformFeesNet", amount: 500 },
        components: [
          { key: "installmentFeeIncome", amount: 45.29, count: 2 },
          {
            key: "pspFee",
            amount: -20,
            syncDependent: true,
            href: "/finance/psp",
          },
          {
            key: "installmentPlatformCost",
            amount: -31.2,
            syncDependent: true,
            href: "/finance/psp",
          },
        ],
        difference: 0,
        balanced: true,
        result: { key: "tarodanNet", amount: 494.09 },
      },
      false,
    );

    expect(lines()).toEqual([
      `${S}.platformNet.lines.installmentFeeIncome(2) = ${fmtTry(45.29)}`,
      `${S}.platformNet.lines.pspFeeadmin.finance.overview.syncOff = −${fmtTry(20)}`,
      `${S}.platformNet.lines.installmentPlatformCostadmin.finance.overview.syncOff = −${fmtTry(31.2)}`,
      `${S}.platformNet.lines.tarodanNet = ${fmtTry(494.09)}`,
    ]);
    expect(
      document.body.querySelectorAll('a[href="/finance/psp"]'),
    ).toHaveLength(2);
  });

  it("breaks the installment fee given back out of the buyer refunds", () => {
    render({
      key: "buyerRefunds",
      kind: "breakdown",
      scope: "allTime",
      total: { key: "refunded", amount: 421.74, count: 1 },
      components: [
        { key: "product", amount: 400 },
        { key: "installmentFee", amount: 21.74 },
        { key: "unclassified", amount: 0 },
      ],
      difference: 0,
      balanced: true,
    });

    expect(lines()).toContain(
      `${S}.buyerRefunds.lines.installmentFee = ${fmtTry(21.74)}`,
    );
  });
});
