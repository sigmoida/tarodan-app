// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "@tarodan/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminKeys } from "@/lib/query/keys";
import type { PayoutTransferRow } from "../_lib/types";

const retryPayoutTransfer = vi.fn();
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
    retryPayoutTransfer: (...args: unknown[]) => retryPayoutTransfer(...args),
  },
}));

import { RetryTransferModal } from "./RetryTransferModal";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const row: PayoutTransferRow = {
  id: "pt1",
  orderId: "o1",
  orderNumber: "ORD-1",
  tradeCashPaymentId: null,
  transId: "PYTTEST000001",
  seller: { id: "s1", displayName: "Satıcı", email: "s@x.com" },
  amount: 349,
  netAmount: 40,
  adjustmentDeduction: 0,
  ibanLast4: "7890",
  status: "failed",
  failureReason: "transfer_outcome_unknown",
  retryCount: 1,
  processedAt: null,
  createdAt: "2026-10-20T09:00:00.000Z",
  submittedTotalAmount: 349,
  transferTotal: null,
  providerMessage: null,
  resolution: {
    retryRequiresProviderCheck: true,
    markPaidMethod: "paytr_confirmed",
    markPaidNetAmount: 40,
    markPaidRequiresProviderCheck: false,
  },
  manualSettlement: null,
};

describe("RetryTransferModal (PayTR outcome unknown)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    retryPayoutTransfer.mockReset();
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
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <ConfirmProvider>
            <RetryTransferModal row={row} onClose={onClose} />
          </ConfirmProvider>
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  const field = <E extends HTMLElement>(name: string) => {
    const el = document.querySelector<E>(`[name="${name}"]`);
    if (!el) throw new Error(`no field ${name}`);
    return el;
  };

  const typeReason = (value: string) =>
    act(() => {
      const el = field<HTMLTextAreaElement>("reason");
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

  const tick = () =>
    act(() => {
      field<HTMLInputElement>("confirmProviderChecked").click();
    });

  const submit = () =>
    act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  it("warns that PayTR may have paid and shows the transaction ID", () => {
    const text = document.body.textContent ?? "";
    expect(text).toContain(
      "admin.finance.payouts.resolution.retryUnknownWarning",
    );
    expect(text).toContain("PYTTEST000001");
  });

  it("does not retry before the PayTR panel check is confirmed", async () => {
    await typeReason("Panelde yok");
    await submit();
    expect(retryPayoutTransfer).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "admin.finance.payouts.resolution.confirmProviderCheckedRequired",
    );
  });

  it("does not retry without a reason", async () => {
    await tick();
    await submit();
    expect(retryPayoutTransfer).not.toHaveBeenCalled();
  });

  it("retries with the confirmed check and the reason", async () => {
    retryPayoutTransfer.mockResolvedValue({ data: { success: true } });
    await tick();
    await typeReason("  Panelde bu trans_id yok  ");
    await submit();

    expect(retryPayoutTransfer).toHaveBeenCalledTimes(1);
    expect(retryPayoutTransfer).toHaveBeenCalledWith("pt1", {
      confirmProviderChecked: true,
      reason: "Panelde bu trans_id yok",
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "admin.finance.payouts.transferRetried",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("a transfer that changed meanwhile closes the dialog and reloads the list", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    retryPayoutTransfer.mockRejectedValue({
      response: {
        status: 409,
        data: {
          message: "Transfer bu arada değişti.",
          i18nKey: "server.admin.payout.transferStateChanged",
        },
      },
    });
    await tick();
    await typeReason("Panelde yok");
    await submit();

    expect(toastError).toHaveBeenCalledWith("Transfer bu arada değişti.");
    expect(onClose).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: adminKeys.all("payouts-transfers"),
    });
  });
});
