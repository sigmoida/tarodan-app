// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getOrderCancelPreview: vi.fn(),
  cancelOrder: vi.fn(),
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
vi.mock("@/lib/api", () => ({
  adminApi: {
    getOrderCancelPreview: h.getOrderCancelPreview,
    cancelOrder: h.cancelOrder,
  },
}));

import {
  apiError,
  bodyText,
  button,
  flush,
  mount,
  type Mounted,
} from "@/test-utils/dom";
import { CancelOrderModal } from "./CancelOrderModal";

const CONFIRM = "admin.operations.orders.cancel.confirm";
const BOOST_SCREEN = 'a[href="/marketing/boost-purchases"]';
let view: Mounted;

async function render() {
  view = mount(
    <CancelOrderModal
      open
      onClose={vi.fn()}
      orderId="order-1"
      orderNumber="BST-1001"
    />,
  );
  await flush();
}

beforeEach(() => {
  h.getOrderCancelPreview.mockReset();
  h.cancelOrder.mockReset();
});

afterEach(() => view.unmount());

describe("CancelOrderModal on a boost order", () => {
  it("points to the boost screen instead of 'preview unavailable' and cannot cancel", async () => {
    h.getOrderCancelPreview.mockRejectedValue(
      apiError(400, "server.admin.payment.boostRefundUseBoostScreen"),
    );
    await render();

    expect(document.body.querySelector(BOOST_SCREEN)).not.toBeNull();
    expect(bodyText()).toContain(
      "server.admin.payment.boostRefundUseBoostScreen",
    );
    expect(bodyText()).not.toContain(
      "admin.operations.orders.cancel.previewUnavailable",
    );
    expect(button(CONFIRM).disabled).toBe(true);
    expect(h.cancelOrder).not.toHaveBeenCalled();
  });

  it("keeps 'preview unavailable' for any other preview error", async () => {
    h.getOrderCancelPreview.mockRejectedValue(
      apiError(400, "server.admin.order.cancelNotAllowed"),
    );
    await render();

    expect(document.body.querySelector(BOOST_SCREEN)).toBeNull();
    expect(bodyText()).toContain(
      "admin.operations.orders.cancel.previewUnavailable",
    );
  });
});
