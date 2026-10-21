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
import { RefundPaymentModal } from "./RefundPaymentModal";

const SUBMIT = "admin.finance.payments.refundConfirm";
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
});
