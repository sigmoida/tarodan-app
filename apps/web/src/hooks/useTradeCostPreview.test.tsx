// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The preview prices the offer the form would send: the cash comes from the
 * same parser as the submit (`@/lib/tlAmount`), so a comma amount is priced
 * with its kuruş and a refused or empty field is priced without cash.
 */
const h = vi.hoisted(() => ({ preview: vi.fn() }));

vi.mock("@/lib/api", () => ({
  tradesApi: { previewPaymentQuote: h.preview },
}));

import { useTradeCostPreview } from "./useTradeCostPreview";

let container: HTMLDivElement;
let root: Root;
let qc: QueryClient;

function Probe(props: { cashAmount: string; cashPayer: "me" | "them" }) {
  useTradeCostPreview({
    myProductIds: ["m1"],
    theirProductIds: ["t1"],
    enabled: true,
    ...props,
  });
  return null;
}

async function render(cashAmount: string, cashPayer: "me" | "them" = "me") {
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <Probe cashAmount={cashAmount} cashPayer={cashPayer} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await vi.waitFor(() => expect(h.preview).toHaveBeenCalled());
  });
  return h.preview.mock.calls[0][0];
}

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.preview.mockReset();
  h.preview.mockResolvedValue({ data: { data: {} } });
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useTradeCostPreview, cash amount", () => {
  it.each(["1250,50", "1250.50"])(
    "prices %s as 1250.5 paid by the side building the offer",
    async (raw) => {
      expect(await render(raw)).toEqual({
        initiatorItems: [{ productId: "m1", quantity: 1 }],
        receiverItems: [{ productId: "t1", quantity: 1 }],
        cashAmount: 1250.5,
        cashPayer: "initiator",
      });
    },
  );

  it("maps their payment to the receiver side, unsigned", async () => {
    const body = await render("12,50", "them");
    expect(body.cashAmount).toBe(12.5);
    expect(body.cashPayer).toBe("receiver");
  });

  it.each(["", "0,00", "1.000", "12,345"])(
    "prices %j without cash",
    async (raw) => {
      expect((await render(raw)).cashAmount).toBeUndefined();
    },
  );
});
