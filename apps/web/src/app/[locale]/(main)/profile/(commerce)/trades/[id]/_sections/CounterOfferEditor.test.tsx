// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/OptimizedImage", () => ({ default: () => null }));
vi.mock("@/components/trade/TradeCostPreview", () => ({ default: () => null }));

import CounterOfferEditor from "./CounterOfferEditor";
import type { TradeDetailVM } from "../_hooks/useTradeDetail";

const render = (cash: { raw: string; value: number; error?: string }) => {
  const vm = {
    t: (k: string) => k,
    isLoadingCounterData: false,
    counterTargetProducts: [],
    counterProducts: [],
    selectedCounterTargetProducts: [],
    selectedCounterProducts: [],
    counterCashAmount: cash.raw,
    counterCashValue: cash.value,
    counterCashError: cash.error,
    setCounterCashAmount: vi.fn(),
    counterCashPayer: "me",
    counterMessage: "",
  } as unknown as TradeDetailVM;
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<CounterOfferEditor vm={vm} />));
  return container;
};

describe("CounterOfferEditor, cash amount field", () => {
  it("shows the helper under the field and no warning for a valid value", () => {
    const c = render({ raw: "12,50", value: 12.5 });
    expect(c.textContent).toContain("trade.cashHelper");
    expect(c.textContent).not.toContain("validation.amountFormatRefused");
  });

  it("shows the error the hook gives (above the API's ceiling)", () => {
    const c = render({
      raw: "10000000",
      value: 0,
      error: "validation.amountAboveMax",
    });
    expect(c.textContent).toContain("validation.amountAboveMax");
    expect(c.textContent).not.toContain("trade.whoPaysCash");
  });

  it("shows the refusal warning for a refused value", () => {
    const c = render({
      raw: "1.000",
      value: 0,
      error: "validation.amountFormatRefused",
    });
    expect(c.textContent).toContain("validation.amountFormatRefused");
  });

  it("asks who pays only for the parsed amount, not the raw text", () => {
    expect(render({ raw: "12,50", value: 12.5 }).textContent).toContain(
      "trade.whoPaysCash",
    );
    // "1.000" would read as 1 with parseFloat; refused, it is no amount.
    expect(
      render({
        raw: "1.000",
        value: 0,
        error: "validation.amountFormatRefused",
      }).textContent,
    ).not.toContain("trade.whoPaysCash");
  });
});
