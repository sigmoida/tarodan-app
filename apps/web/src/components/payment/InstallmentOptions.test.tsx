// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallmentOption } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The key comes back with its values, so the test reads what was asked for.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}${JSON.stringify(values)}` : key,
}));

import InstallmentOptions, {
  type InstallmentOptionsView,
} from "./InstallmentOptions";
import InstallmentTerms from "./InstallmentTerms";

const SINGLE: InstallmentOption = {
  count: 1,
  totalAmount: 1000,
  feeAmount: 0,
  monthlyAmount: 1000,
};
const THREE: InstallmentOption = {
  count: 3,
  totalAmount: 1066.38,
  feeAmount: 66.38,
  monthlyAmount: 355.46,
};
const TWO_FREE: InstallmentOption = {
  count: 2,
  totalAmount: 1000,
  feeAmount: 0,
  monthlyAmount: 500,
};
const OPTIONS: InstallmentOptionsView = {
  status: "done",
  offer: {
    kind: "options",
    card: { bank: "Test Bank", family: "world" },
    options: [SINGLE, TWO_FREE, THREE],
  },
};

let container: HTMLDivElement;
let root: Root;
const onSelect = vi.fn();

function render(view: InstallmentOptionsView, selectedCount = 1) {
  act(() =>
    root.render(
      <InstallmentOptions
        view={view}
        selectedCount={selectedCount}
        onSelect={onSelect}
      />,
    ),
  );
}
const q = (selector: string) => container.querySelector(selector);
const radios = () =>
  Array.from(
    container.querySelectorAll('input[type="radio"]'),
  ) as HTMLInputElement[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("InstallmentOptions", () => {
  it("options: a named radio group, single payment checked first", () => {
    render(OPTIONS);
    const group = q('[role="radiogroup"]') as HTMLElement;
    expect(group).not.toBeNull();
    const title = document.getElementById(
      group.getAttribute("aria-labelledby") ?? "",
    );
    expect(title?.textContent).toBe("payment.installments.title");

    const list = radios();
    expect(list.map((r) => r.value)).toEqual(["1", "2", "3"]);
    expect(list[0].checked).toBe(true);
    // One group: the radios share a name (arrow keys move between them).
    expect(new Set(list.map((r) => r.name)).size).toBe(1);
    expect(q('[data-testid="installment-card"]')?.textContent).toBe(
      "Test Bank · World",
    );
  });

  it("each option names count, monthly, total and fee", () => {
    render(OPTIONS);
    const [single, two, three] = radios();
    expect(single.getAttribute("aria-label")).toContain(
      "payment.installments.single",
    );
    expect(single.getAttribute("aria-label")).not.toContain("fee");
    const label = three.getAttribute("aria-label") ?? "";
    expect(label).toContain('payment.installments.count{"count":3}');
    expect(label).toContain("payment.installments.monthly");
    expect(label).toContain("355,46 TL");
    expect(label).toContain("payment.installments.total");
    expect(label).toContain("1.066,38 TL");
    expect(label).toContain("payment.installments.fee");
    expect(label).toContain("66,38 TL");
    // A count without a fee says so instead of "fee 0".
    expect(two.getAttribute("aria-label")).toContain(
      "payment.installments.noFee",
    );
  });

  it("selecting a count reports it and checks it", () => {
    render(OPTIONS);
    act(() => radios()[2].click());
    expect(onSelect).toHaveBeenCalledWith(3);
    render(OPTIONS, 3);
    expect(radios()[2].checked).toBe(true);
    expect(radios()[0].checked).toBe(false);
  });

  it("loading: a skeleton row and the live announcement", () => {
    render({ status: "loading" });
    expect(q('[data-testid="installment-options-loading"]')).not.toBeNull();
    expect(radios()).toHaveLength(0);
    expect(q('[aria-live="polite"]')?.textContent).toBe(
      "payment.installments.loading",
    );
  });

  it("enter card: the hint before 8 digits", () => {
    render({ status: "enterCard" });
    expect(q('[data-testid="installment-note"]')?.textContent).toBe(
      "payment.installments.enterCard",
    );
  });

  it.each([
    ["card_not_eligible", "payment.installments.notEligible"],
    ["not_offered_for_payment", "payment.installments.notOffered"],
    ["unavailable", "payment.installments.unavailable"],
  ] as const)("%s: the one-line note, announced", (reason, key) => {
    render({ status: "done", offer: { kind: "single", reason } });
    expect(q('[data-testid="installment-note"]')?.textContent).toBe(key);
    expect(q('[aria-live="polite"]')?.textContent).toBe(key);
    expect(radios()).toHaveLength(0);
  });

  it("below the minimum: the note with the minimum amount", () => {
    render({
      status: "done",
      offer: { kind: "single", reason: "below_minimum", minAmount: 500 },
    });
    expect(q('[data-testid="installment-note"]')?.textContent).toBe(
      'payment.installments.belowMinimum{"amount":"500,00 TL"}',
    );
  });

  it("hidden (switch went off) and idle render nothing", () => {
    render({ status: "done", offer: { kind: "hidden" } });
    expect(container.innerHTML).toBe("");
    render({ status: "idle" });
    expect(container.innerHTML).toBe("");
  });
});

describe("InstallmentTerms (pre-information, AS-L1)", () => {
  it("states count, monthly, fee and total with the refund note", () => {
    act(() => root.render(<InstallmentTerms option={THREE} />));
    const text = q('[data-testid="installment-terms"]')?.textContent ?? "";
    expect(text).toContain(
      'payment.installments.terms{"count":3,"monthly":"355,46 TL","fee":"66,38 TL","total":"1.066,38 TL"}',
    );
    expect(text).toContain("payment.installments.refundNote");
  });

  it("nothing for the single payment", () => {
    act(() => root.render(<InstallmentTerms option={SINGLE} />));
    expect(container.innerHTML).toBe("");
    act(() => root.render(<InstallmentTerms option={null} />));
    expect(container.innerHTML).toBe("");
  });
});
