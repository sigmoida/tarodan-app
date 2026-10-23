// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "@tarodan/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminKeys } from "@/lib/query/keys";
import type { PayoutTransferRow } from "../_lib/types";

const markPayoutTransferPaid = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("react-hot-toast", () => ({
  default: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));
vi.mock("@/lib/api", () => ({
  adminApi: {
    markPayoutTransferPaid: (...args: unknown[]) =>
      markPayoutTransferPaid(...args),
  },
}));

import { MarkPaidModal } from "./MarkPaidModal";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const row = (over: Partial<PayoutTransferRow> = {}): PayoutTransferRow => ({
  id: "pt1",
  orderId: "o1",
  orderNumber: "ORD-1",
  tradeCashPaymentId: null,
  transId: "PYTTEST000002",
  seller: { id: "s1", displayName: "Satıcı", email: "s@x.com" },
  amount: 349,
  netAmount: 40,
  adjustmentDeduction: 0,
  ibanLast4: "7890",
  status: "failed",
  failureReason: "transfer_needs_manual_decision",
  retryCount: 0,
  processedAt: null,
  createdAt: "2026-10-20T09:00:00.000Z",
  submittedTotalAmount: null,
  transferTotal: {
    net: 40,
    allowedTotal: 15,
    ownAllowed: 303,
    oidRemaining: 15,
    missingInput: null,
  },
  providerMessage: null,
  resolution: {
    retryRequiresProviderCheck: false,
    markPaidMethod: "external_bank",
    markPaidNetAmount: 40,
  },
  manualSettlement: null,
  ...over,
});

/** Never settles: the request stays in flight. */
const pending = () => new Promise(() => {});

describe("MarkPaidModal", () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    markPayoutTransferPaid.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    onClose = vi.fn();
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  const render = (r: PayoutTransferRow = row()) =>
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <ConfirmProvider>
            <MarkPaidModal row={r} onClose={onClose} />
          </ConfirmProvider>
        </QueryClientProvider>,
      );
    });

  const field = (name: string) => {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[name="${name}"]`,
    );
    if (!el) throw new Error(`no field ${name}`);
    return el;
  };

  const type = (name: string, value: string) =>
    act(() => {
      const el = field(name);
      const proto = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

  const fillValid = async () => {
    await type("reference", " DEKONT-42 ");
    await type("reason", " PayTR'de kalan yok ");
    await type("typedAmount", "40,00");
  };

  const form = () => document.querySelector("form")!;

  /** Submits the form the way Enter in a field does. */
  const submit = () =>
    act(async () => {
      form().dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      // Let RHF's async validation and the mutation start.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  it("shows the method, its explanation, the net and the breakdown", async () => {
    await render();
    const text = document.body.textContent ?? "";
    expect(text).toContain(
      "admin.finance.payouts.resolution.method.external_bank",
    );
    expect(text).toContain(
      "admin.finance.payouts.resolution.markPaidHelp.external_bank",
    );
    expect(text).toContain("PYTTEST000002");
    expect(text).toContain("admin.finance.payouts.resolution.breakdownTitle");
    expect(text).toContain(
      "status.payoutFailureReason.transfer_needs_manual_decision",
    );
  });

  it("sends the row's method and net with the trimmed reference and reason", async () => {
    markPayoutTransferPaid.mockResolvedValue({
      data: { success: true, alreadySettled: false },
    });
    await render();
    await fillValid();
    await submit();

    expect(markPayoutTransferPaid).toHaveBeenCalledTimes(1);
    expect(markPayoutTransferPaid).toHaveBeenCalledWith("pt1", {
      method: "external_bank",
      reference: "DEKONT-42",
      reason: "PayTR'de kalan yok",
      expectedNetAmount: 40,
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "admin.finance.payouts.resolution.markedPaid",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("sends paytr_confirmed with the net the row confirms", async () => {
    markPayoutTransferPaid.mockResolvedValue({
      data: { success: true, alreadySettled: true },
    });
    await render(
      row({
        failureReason: "transfer_outcome_unknown",
        transferTotal: null,
        resolution: {
          retryRequiresProviderCheck: true,
          markPaidMethod: "paytr_confirmed",
          markPaidNetAmount: 38.5,
        },
      }),
    );
    await type("reference", "PAYTR-REF");
    await type("reason", "Panelde var");
    await type("typedAmount", "38,50");
    await submit();

    expect(markPayoutTransferPaid).toHaveBeenCalledWith("pt1", {
      method: "paytr_confirmed",
      reference: "PAYTR-REF",
      reason: "Panelde var",
      expectedNetAmount: 38.5,
    });
    // A repeated request found it settled: said so, not "marked".
    expect(toastSuccess).toHaveBeenCalledWith(
      "admin.finance.payouts.resolution.alreadyMarkedPaid",
    );
  });

  it("sends one request when submitted twice while the first runs", async () => {
    markPayoutTransferPaid.mockImplementation(pending);
    await render();
    await fillValid();
    await submit();
    await submit();
    expect(markPayoutTransferPaid).toHaveBeenCalledTimes(1);
  });

  it("does not send when the typed amount is not the net", async () => {
    await render();
    await fillValid();
    await type("typedAmount", "4,00");
    await submit();
    expect(markPayoutTransferPaid).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "admin.finance.payouts.resolution.markPaidTypedMismatch",
    );
  });

  it("a changed net closes the dialog, reloads the list and shows the API's message", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    markPayoutTransferPaid.mockRejectedValue({
      response: {
        status: 409,
        data: {
          message: "Güncel tutar 35.00 TL.",
          i18nKey: "server.admin.payout.markPaidAmountChanged",
        },
      },
    });
    await render();
    await fillValid();
    await submit();

    expect(toastError).toHaveBeenCalledWith("Güncel tutar 35.00 TL.");
    expect(onClose).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: adminKeys.all("payouts-transfers"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: adminKeys.all("payouts-summary"),
    });
  });

  it("a missing reference marks the field and keeps the dialog", async () => {
    markPayoutTransferPaid.mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: "Ödeme referansı zorunludur.",
          i18nKey: "server.admin.payout.referenceRequired",
        },
      },
    });
    await render();
    await fillValid();
    await submit();

    expect(onClose).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Ödeme referansı zorunludur.");
  });

  it("an unexpected error stays in the dialog and allows another try", async () => {
    markPayoutTransferPaid.mockRejectedValueOnce(new Error("Network Error"));
    markPayoutTransferPaid.mockResolvedValueOnce({
      data: { success: true, alreadySettled: false },
    });
    await render();
    await fillValid();
    await submit();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("common.operationFailed");

    await submit();
    expect(markPayoutTransferPaid).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalled();
  });
});
