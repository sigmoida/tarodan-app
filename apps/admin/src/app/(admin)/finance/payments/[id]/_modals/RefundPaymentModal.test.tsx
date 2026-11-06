// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  manualRefund: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ adminApi: { manualRefund: h.manualRefund } }));

import {
  apiError,
  bodyText,
  button,
  click,
  dialogs,
  field,
  findButton,
  mount,
  type,
  type Mounted,
} from "@/test-utils/dom";
import { fmtTry } from "@/lib/format";
import { RefundPaymentModal } from "./RefundPaymentModal";

const SUBMIT = "admin.finance.payments.refundConfirm";
const R = "admin.finance.payments.refundInstallment";
const onClose = vi.fn();
let view: Mounted;

const amount = () => field<HTMLInputElement>('input[name="amount"]');

beforeEach(() => {
  h.manualRefund.mockReset().mockResolvedValue({ data: {} });
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  onClose.mockReset();
  view = mount(
    <RefundPaymentModal paymentId="pay-1" amount={500} onClose={onClose} />,
  );
});

afterEach(() => view.unmount());

describe("RefundPaymentModal", () => {
  it("sends a decimal-comma amount as that amount, not as a full refund", async () => {
    await type(amount(), "50,25");
    await click(button(SUBMIT, dialogs()[0]));

    expect(h.manualRefund).toHaveBeenCalledWith(
      "pay-1",
      expect.objectContaining({ amount: 50.25 }),
    );
  });

  it("refuses text that is not an amount instead of refunding everything", async () => {
    await type(amount(), "1.250,50");
    await click(button(SUBMIT, dialogs()[0]));

    expect(bodyText()).toContain("admin.finance.payments.refundAmountInvalid");
    expect(h.manualRefund).not.toHaveBeenCalled();
  });

  it("leaves the amount out when the field is empty (the server refunds all)", async () => {
    await click(button(SUBMIT, dialogs()[0]));

    expect(h.manualRefund).toHaveBeenCalledTimes(1);
    const [, body] = h.manualRefund.mock.calls[0];
    expect(body.amount).toBeUndefined();
  });

  it("caps the amount at the payment amount", async () => {
    await type(amount(), "500,01");
    await click(button(SUBMIT, dialogs()[0]));
    expect(bodyText()).toContain("admin.finance.payments.refundAmountInvalid");
    expect(h.manualRefund).not.toHaveBeenCalled();

    await type(amount(), "500");
    await click(button(SUBMIT, dialogs()[0]));
    expect(h.manualRefund).toHaveBeenCalledWith(
      "pay-1",
      expect.objectContaining({ amount: 500 }),
    );
  });

  it("resends a refused attempt with the same idempotency key", async () => {
    h.manualRefund
      .mockRejectedValueOnce(apiError(409, "server.payment.refundInProgress"))
      .mockResolvedValueOnce({ data: {} });
    await type(amount(), "20");
    await click(button(SUBMIT, dialogs()[0]));
    expect(h.toast.error).toHaveBeenCalled();
    await click(button(SUBMIT, dialogs()[0]));

    expect(h.manualRefund).toHaveBeenCalledTimes(2);
    const [first, second] = h.manualRefund.mock.calls.map(
      ([, body]) => body.idempotencyKey,
    );
    expect(typeof first).toBe("string");
    expect(first).not.toBe("");
    expect(second).toBe(first);
  });

  it("refetches the payment screens after an unknown outcome", async () => {
    const invalidate = vi.spyOn(view.client, "invalidateQueries");
    h.manualRefund.mockRejectedValue(new Error("Network Error"));
    await type(amount(), "20");
    await click(button(SUBMIT, dialogs()[0]));

    expect(
      invalidate.mock.calls.map(([filters]) => filters?.queryKey),
    ).toContainEqual(["payments"]);
  });

  it("replaces the form after an unknown outcome and offers no resubmit", async () => {
    h.manualRefund.mockRejectedValue(apiError(503));
    await type(amount(), "20");
    await click(button(SUBMIT, dialogs()[0]));

    expect(bodyText()).toContain(
      "admin.finance.payments.refundReconciliation.outcomeUnknown",
    );
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(findButton(SUBMIT)).toBeUndefined();
  });

  it("points a boost payment to the boost purchases screen", async () => {
    h.manualRefund.mockRejectedValue(
      apiError(400, "server.admin.payment.boostRefundUseBoostScreen"),
    );
    await click(button(SUBMIT, dialogs()[0]));

    expect(
      document.body.querySelector('a[href="/marketing/boost-purchases"]'),
    ).not.toBeNull();
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("toasts the plain refund message for a single payment", async () => {
    h.manualRefund.mockResolvedValue({
      data: {
        success: true,
        refundAmount: 20,
        installmentFeeRefunded: 0,
        cashRefunded: 20,
      },
    });
    await type(amount(), "20");
    await click(button(SUBMIT, dialogs()[0]));

    expect(h.toast.success.mock.calls[0][0]).toBe(
      "admin.finance.payments.refundStarted",
    );
    expect(onClose).toHaveBeenCalled();
  });
});

describe("RefundPaymentModal for an installment payment (ADR 0019)", () => {
  // Plan 4.4: T 1,000.00, F 54.35, C 1,054.35.
  const installment = { installmentFeeAmount: 54.35, chargedAmount: 1054.35 };

  beforeEach(() => {
    view.unmount();
    view = mount(
      <RefundPaymentModal
        paymentId="pay-1"
        amount={1000}
        installment={installment}
        onClose={onClose}
      />,
    );
  });

  it("shows the goods amount, the fee and the charge, and says the fee share follows", () => {
    const text = bodyText();
    expect(text).toContain("admin.finance.payments.installment.goodsAmount");
    expect(text).toContain(fmtTry(1000));
    expect(text).toContain("admin.finance.installments.preview.columns.fee");
    expect(text).toContain(fmtTry(54.35));
    expect(text).toContain("admin.finance.payments.installment.chargedAmount");
    expect(text).toContain(fmtTry(1054.35));
    expect(text).toContain(`${R}.noticeTitle`);
    // No fixed fee amount: after a partial refund less than F is left.
    expect(text).toContain(`${R}.notice`);
    expect(text).not.toContain(`${R}.notice|`);
    expect(text).toContain(`${R}.amountLabel`);
    expect(text).not.toContain("admin.finance.payments.totalPaymentAmount");
  });

  it("caps the entered goods amount at the goods total, not at the charge", async () => {
    await type(amount(), "1054,35");
    await click(button(SUBMIT, dialogs()[0]));
    expect(bodyText()).toContain("admin.finance.payments.refundAmountInvalid");
    expect(h.manualRefund).not.toHaveBeenCalled();

    await type(amount(), "1000");
    await click(button(SUBMIT, dialogs()[0]));
    // The goods part goes to the API; the server adds the fee share.
    expect(h.manualRefund).toHaveBeenCalledWith(
      "pay-1",
      expect.objectContaining({ amount: 1000 }),
    );
  });

  it("names the cash the buyer gets back, fee share included, from the response", async () => {
    // 400.00 goods of 1,000.00 -> 21.74 fee share, 421.74 cash.
    h.manualRefund.mockResolvedValue({
      data: {
        success: true,
        refundAmount: 400,
        installmentFeeRefunded: 21.74,
        cashRefunded: 421.74,
      },
    });
    await type(amount(), "400");
    await click(button(SUBMIT, dialogs()[0]));

    expect(h.toast.success.mock.calls[0][0]).toBe(
      `${R}.started|${JSON.stringify({
        cash: fmtTry(421.74),
        fee: fmtTry(21.74),
      })}`,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the plain message when no fee share went back", async () => {
    h.manualRefund.mockResolvedValue({
      data: {
        success: true,
        refundAmount: 0.4,
        installmentFeeRefunded: 0,
        cashRefunded: 0.4,
      },
    });
    await type(amount(), "0,40");
    await click(button(SUBMIT, dialogs()[0]));

    expect(h.toast.success.mock.calls[0][0]).toBe(
      "admin.finance.payments.refundStarted",
    );
  });

  it("falls back to the plain message when an older API sends no split", async () => {
    h.manualRefund.mockResolvedValue({ data: { success: true } });
    await click(button(SUBMIT, dialogs()[0]));

    expect(h.toast.success.mock.calls[0][0]).toBe(
      "admin.finance.payments.refundStarted",
    );
  });

  it("keeps the trade copy for a trade payment", () => {
    view.unmount();
    view = mount(
      <RefundPaymentModal
        paymentId="pay-1"
        amount={1000}
        installment={installment}
        trade={{ tradeNumber: "TRD-1", refundableTotal: 900 }}
        onClose={onClose}
      />,
    );
    expect(bodyText()).not.toContain(`${R}.noticeTitle`);
    expect(bodyText()).toContain("admin.finance.payments.tradeRefundTitle");
  });
});
