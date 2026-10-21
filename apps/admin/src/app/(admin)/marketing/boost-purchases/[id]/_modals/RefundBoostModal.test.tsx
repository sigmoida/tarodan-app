// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  refundBoost: vi.fn(),
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
vi.mock("@/lib/api", () => ({ adminApi: { refundBoost: h.refundBoost } }));

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
import { RefundBoostModal } from "./RefundBoostModal";

const ACTION = "admin.marketing.boostPurchases.refund.action";
const CONFIRM_TEXT = "admin.marketing.boostPurchases.refund.confirm";
const PARTIAL = "admin.marketing.boostPurchases.refund.partialStops";
const PENDING = "admin.marketing.boostPurchases.refund.pendingReconciliation";
const REASON = "Seller asked, listing sold elsewhere";

const PURCHASE = {
  id: "boost-1",
  price: 59,
  refundedAmount: 0,
  refundableAmount: 59,
};

const onClose = vi.fn();
let view: Mounted;

const amount = () => field<HTMLInputElement>('input[name="amount"]');
const reason = () => field<HTMLTextAreaElement>('textarea[name="reason"]');
const topDialog = () => dialogs().at(-1)!;

/** Submits the form, then answers the confirm step. */
async function submit(answer: "confirm" | "cancel" | "none" = "confirm") {
  await click(button(ACTION, dialogs()[0]));
  if (answer === "none") return;
  const confirmDialog = topDialog();
  await click(
    button(answer === "confirm" ? ACTION : "common.cancel", confirmDialog),
  );
}

beforeEach(() => {
  h.refundBoost.mockReset().mockResolvedValue({ data: { id: "boost-1" } });
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  onClose.mockReset();
  view = mount(<RefundBoostModal purchase={PURCHASE} onClose={onClose} />);
});

afterEach(() => view.unmount());

describe("RefundBoostModal", () => {
  it("defaults the amount to the refundable amount and says a partial refund stops the boost", () => {
    expect(amount().value).toBe("59");
    expect(bodyText()).toContain(
      'admin.marketing.boostPurchases.refund.amountHelper|{"max":',
    );
    expect(bodyText()).toContain(PARTIAL);
  });

  it("requires a reason of the shared minimum length before anything else", async () => {
    await submit("none");
    expect(bodyText()).toContain("common.required");
    expect(dialogs()).toHaveLength(1);

    await type(reason(), "too short");
    await submit("none");
    expect(bodyText()).toContain('validation.minLength|{"min":10}');
    expect(dialogs()).toHaveLength(1);
    expect(h.refundBoost).not.toHaveBeenCalled();
  });

  it.each(["59.01", "60", "0", "-5", "12.345"])(
    "refuses the amount %s without calling the API",
    async (value) => {
      await type(amount(), value);
      await type(reason(), REASON);
      await submit("none");
      expect(bodyText()).toContain(
        "admin.finance.payments.refundAmountInvalid",
      );
      expect(dialogs()).toHaveLength(1);
      expect(h.refundBoost).not.toHaveBeenCalled();
    },
  );

  it("asks for confirmation and sends nothing when it is declined", async () => {
    await type(reason(), REASON);
    await submit("none");
    expect(topDialog().textContent).toContain(CONFIRM_TEXT);

    await click(button("common.cancel", topDialog()));
    expect(h.refundBoost).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("refunds the full amount after the confirm, with no idempotency key", async () => {
    await type(reason(), `  ${REASON}  `);
    await submit("none");
    // A full refund: the confirm does not repeat the partial warning.
    expect(topDialog().textContent).not.toContain(PARTIAL);
    await click(button(ACTION, topDialog()));

    expect(h.refundBoost).toHaveBeenCalledTimes(1);
    expect(h.refundBoost).toHaveBeenCalledWith("boost-1", {
      amount: 59,
      reason: REASON,
    });
    expect(h.toast.success).toHaveBeenCalledWith(
      "admin.marketing.boostPurchases.refund.done",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("repeats in the confirm that a partial refund stops the boost for good", async () => {
    await type(amount(), "20.5");
    await type(reason(), REASON);
    await submit("none");
    expect(topDialog().textContent).toContain(PARTIAL);
    await click(button(ACTION, topDialog()));

    expect(h.refundBoost).toHaveBeenCalledWith("boost-1", {
      amount: 20.5,
      reason: REASON,
    });
  });

  it("leaves the amount out when it is emptied (the server refunds all)", async () => {
    await type(amount(), "");
    await type(reason(), REASON);
    await submit();

    expect(h.refundBoost).toHaveBeenCalledWith("boost-1", { reason: REASON });
  });

  it("shows a server refusal as a toast and keeps the form", async () => {
    h.refundBoost.mockRejectedValue(
      apiError(400, "server.admin.boost.refundNotAllowed"),
    );
    await type(reason(), REASON);
    await submit();

    expect(h.toast.error).toHaveBeenCalledWith(
      "server:server.admin.boost.refundNotAllowed",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(findButton(ACTION)).toBeDefined();
  });

  it("on 503 says the outcome is pending, links the reconciliation and offers no retry", async () => {
    h.refundBoost.mockRejectedValue(
      apiError(503, "server.payment.refundInitiationFailed"),
    );
    await type(reason(), REASON);
    await submit();

    expect(bodyText()).toContain(PENDING);
    expect(h.toast.error).not.toHaveBeenCalled();
    const link = document.body.querySelector<HTMLAnchorElement>(
      'a[href="/finance/payments?tab=reconciliation"]',
    );
    expect(link?.textContent).toBe(
      "admin.finance.payments.refundReconciliation.action",
    );
    expect(findButton(ACTION)).toBeUndefined();
    expect(h.refundBoost).toHaveBeenCalledTimes(1);

    await click(button("common.close", topDialog()));
    expect(onClose).toHaveBeenCalled();
  });
});
