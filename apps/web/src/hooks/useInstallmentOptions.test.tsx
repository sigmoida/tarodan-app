// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallmentOptionsResponse } from "@tarodan/types";
import type { InstallmentCardSource } from "@/lib/installments";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ installmentOptions: vi.fn() }));
vi.mock("@/lib/api", () => ({
  paymentsApi: { installmentOptions: h.installmentOptions },
}));

import { useInstallmentOptions } from "./useInstallmentOptions";

type Result = ReturnType<typeof useInstallmentOptions>;
type Input = Parameters<typeof useInstallmentOptions>[0];

const ANSWER: InstallmentOptionsResponse = {
  enabled: true,
  card: { bank: "Test Bank", family: "world", type: "credit" },
  baseAmount: 1000,
  options: [
    { count: 1, totalAmount: 1000, feeAmount: 0, monthlyAmount: 1000 },
    { count: 3, totalAmount: 1066.38, feeAmount: 66.38, monthlyAmount: 355.46 },
    {
      count: 6,
      totalAmount: 1142.22,
      feeAmount: 142.22,
      monthlyAmount: 190.37,
    },
  ],
};
const bin = (b: string): InstallmentCardSource => ({ kind: "bin", bin: b });

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let queryErrors: unknown[];
let result: Result;

function Probe(props: Input) {
  result = useInstallmentOptions(props);
  return null;
}

function render(props: Input) {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe {...props} />
      </QueryClientProvider>,
    ),
  );
}

/**
 * Lets the 300 ms debounce and then the answer through. Two acts: React
 * applies the debounced update when the first act ends, and the request it
 * starts answers inside the second.
 */
const settle = async (ms = 350) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryErrors = [];
  client = new QueryClient({
    queryCache: new QueryCache({ onError: (e) => queryErrors.push(e) }),
  });
  h.installmentOptions.mockResolvedValue({ data: ANSWER });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
  vi.clearAllMocks();
});

const base: Input = {
  paymentId: "pay-1",
  amount: 1000,
  source: null,
  enabled: true,
};

describe("useInstallmentOptions", () => {
  it("is idle without a card and calls nothing", async () => {
    render(base);
    await settle();
    expect(result.state).toEqual({ status: "idle" });
    expect(h.installmentOptions).not.toHaveBeenCalled();
  });

  it("is idle and silent when disabled", async () => {
    render({ ...base, enabled: false, source: bin("45467112") });
    await settle();
    expect(result.state).toEqual({ status: "idle" });
    expect(h.installmentOptions).not.toHaveBeenCalled();
  });

  it("prices the BIN for the payment after the debounce (BIN-only body)", async () => {
    render({ ...base, source: bin("45467112") });
    expect(result.state.status).toBe("loading");
    await settle();

    expect(h.installmentOptions).toHaveBeenCalledTimes(1);
    const [body, opts] = h.installmentOptions.mock.calls[0];
    expect(body).toEqual({ bin: "45467112", paymentId: "pay-1" });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(result.state).toMatchObject({
      status: "done",
      offer: { kind: "options" },
    });
    expect(result.chosen).toBeNull();
    expect(result.selectedCount).toBe(1);
  });

  it("debounces typing: only the last BIN is asked", async () => {
    render(base);
    render({ ...base, source: bin("45467112") });
    await settle(100);
    render({ ...base, source: bin("45467113") });
    await settle(100);
    render({ ...base, source: bin("45467114") });
    await settle();
    expect(h.installmentOptions).toHaveBeenCalledTimes(1);
    expect(h.installmentOptions.mock.calls[0][0].bin).toBe("45467114");
  });

  it("aborts the request of a superseded card and never shows its answer", async () => {
    let firstSignal: AbortSignal | undefined;
    h.installmentOptions.mockImplementationOnce(
      (_body: unknown, opts: { signal: AbortSignal }) => {
        firstSignal = opts.signal;
        // Like axios: no answer until the abort rejects the request.
        return new Promise((_resolve, reject) =>
          opts.signal.addEventListener("abort", () =>
            reject(new Error("canceled")),
          ),
        );
      },
    );
    render({ ...base, source: bin("45467112") });
    await settle();
    expect(firstSignal?.aborted).toBe(false);

    render({ ...base, source: bin("55555555") });
    await settle(500);
    expect(firstSignal?.aborted).toBe(true);
    expect(h.installmentOptions).toHaveBeenCalledTimes(2);
    expect(result.state.status).toBe("done");
    expect(result.sourceKey).toBe("bin:55555555");
    // The aborted request's key holds the old BIN: never reported either.
    expect(queryErrors).toEqual([]);
  });

  it("leaving the page mid-request aborts it without a reported query error", async () => {
    let signal: AbortSignal | undefined;
    h.installmentOptions.mockImplementationOnce(
      (_body: unknown, opts: { signal: AbortSignal }) => {
        signal = opts.signal;
        return new Promise((_resolve, reject) =>
          opts.signal.addEventListener("abort", () =>
            reject(new Error("canceled")),
          ),
        );
      },
    );
    render({ ...base, source: bin("45467112") });
    await settle();
    act(() => root.unmount());
    await settle(10);
    expect(signal?.aborted).toBe(true);
    expect(queryErrors).toEqual([]);
    // afterEach unmounts again: give it a fresh root.
    root = createRoot(container);
  });

  it("while the typed card differs from the priced one, its options are neither shown nor payable", async () => {
    render({ ...base, source: bin("45467112") });
    await settle();
    expect(result.state.status).toBe("done");

    // Another BIN inside the debounce: the first card's prices must not be
    // offered for the second card.
    render({ ...base, source: bin("55555555") });
    expect(result.state.status).toBe("loading");
    act(() => result.select(6));
    expect(result.chosen).toBeNull();
    expect(result.selectedCount).toBe(1);
    await settle(100);
    expect(result.state.status).toBe("loading");
    expect(result.chosen).toBeNull();
  });

  it("checkout before the order: prices the goods total (amount, two decimals)", async () => {
    render({
      paymentId: null,
      amount: 1066.384,
      source: bin("45467112"),
      enabled: true,
    });
    await settle();
    expect(h.installmentOptions.mock.calls[0][0]).toEqual({
      bin: "45467112",
      amount: 1066.38,
    });
  });

  it("a saved card sends its id, never digits", async () => {
    render({ ...base, source: { kind: "saved", savedCardId: "card-1" } });
    await settle();
    expect(h.installmentOptions.mock.calls[0][0]).toEqual({
      savedCardId: "card-1",
      paymentId: "pay-1",
    });
  });

  it("selects a count; another card resets it to single", async () => {
    render({ ...base, source: bin("45467112") });
    await settle();
    act(() => result.select(3));
    expect(result.chosen?.count).toBe(3);
    expect(result.selectedCount).toBe(3);

    render({ ...base, source: bin("55555555") });
    expect(result.chosen).toBeNull();
    expect(result.selectedCount).toBe(1);
    expect(result.pending).toBe(false);
    await settle();
    expect(result.state.status).toBe("done");
    expect(result.chosen).toBeNull();
  });

  it("any failure is the single payment with the unavailable note, never a reported query error", async () => {
    h.installmentOptions.mockRejectedValueOnce({
      response: { status: 429, data: {} },
    });
    render({ ...base, source: bin("45467112") });
    await settle();
    expect(result.state).toEqual({
      status: "done",
      offer: { kind: "single", reason: "unavailable" },
    });
    // The key holds the BIN: the global reporter (Sentry) must never see it.
    expect(queryErrors).toEqual([]);
  });

  it("a refused count is not offered again for this card", async () => {
    render({ ...base, source: bin("45467112") });
    await settle();
    act(() => result.select(3));
    act(() => result.refuseChosen());
    expect(result.chosen).toBeNull();
    const offer =
      result.state.status === "done" ? result.state.offer : undefined;
    expect(
      offer?.kind === "options" && offer.options.map((o) => o.count),
    ).toEqual([1, 6]);
  });

  it("refusing the only count above 1 leaves the single payment", async () => {
    h.installmentOptions.mockResolvedValue({
      data: { ...ANSWER, options: ANSWER.options.slice(0, 2) },
    });
    render({ ...base, source: bin("45467112") });
    await settle();
    act(() => result.select(3));
    act(() => result.refuseChosen());
    expect(result.state).toEqual({
      status: "done",
      offer: { kind: "single", reason: "not_offered_for_payment" },
    });
  });

  it("a refetch keeps the count but blocks paying until the new price is in", async () => {
    let answer: (value: unknown) => void = () => {};
    render({ ...base, source: bin("45467112") });
    await settle();
    act(() => result.select(3));

    h.installmentOptions.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    );
    act(() => void result.refetch());
    await settle(10);
    expect(result.pending).toBe(true);
    expect(result.chosen).toBeNull();

    const repriced = {
      ...ANSWER,
      options: [
        ANSWER.options[0],
        { count: 3, totalAmount: 1070, feeAmount: 70, monthlyAmount: 356.67 },
      ],
    };
    await act(async () => answer({ data: repriced }));
    await settle(10);
    expect(result.pending).toBe(false);
    expect(result.chosen).toEqual(repriced.options[1]);
  });
});
