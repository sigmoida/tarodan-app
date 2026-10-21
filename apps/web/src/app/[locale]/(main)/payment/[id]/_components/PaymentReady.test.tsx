// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentKind } from "@/lib/paymentKind";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  prepareDirectForm: vi.fn(),
  listCards: vi.fn(),
  formSubmit: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

// The key comes back instead of the text; rich tags render around their name.
vi.mock("next-intl", () => {
  const t = (key: string) => key;
  t.rich = (key: string, values: Record<string, unknown> = {}) =>
    createElement(
      Fragment,
      null,
      key,
      ...Object.values(values)
        .filter((v) => typeof v === "function")
        .map((render) => (render as (c: ReactNode) => ReactNode)("link")),
    );
  return { useTranslations: () => t };
});
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/lib/api", () => ({
  paymentsApi: { prepareDirectForm: h.prepareDirectForm },
  membershipApi: { listCards: h.listCards },
}));
// The card fields are not under test: a saved card is pre-selected, so the
// submit needs no card input.
vi.mock("@/components/payment/CardPaymentSection", () => ({
  default: () => null,
}));
// The barrel also exports server-only composites.
vi.mock("@/components/ui", () => ({
  SectionCard: ({ children }: { children: ReactNode }) =>
    createElement("section", null, children),
}));

import PaymentReady from "./PaymentReady";

const SAVED_CARD = {
  id: "card-1",
  last4: "4242",
  brand: null,
  bank: null,
  cardType: null,
  cardScheme: null,
  businessCard: null,
  expMonth: null,
  expYear: null,
  requireCvv: false,
};

let container: HTMLDivElement;
let root: Root;

function render(kind: PaymentKind) {
  act(() =>
    root.render(
      <PaymentReady
        target={{ orderId: "order-1" }}
        paymentId="pay-1"
        kind={kind}
        amount={100}
        cardStorageEnabled
        purpose={kind === "membership" ? "membership" : "checkout"}
        hasTarget
        onCancel={vi.fn()}
        cancelling={false}
        retry={vi.fn()}
      />,
    ),
  );
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
const checkboxes = () =>
  Array.from(
    container.querySelectorAll('input[type="checkbox"]'),
  ) as HTMLInputElement[];
function payButton(): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("checkout.payNow"),
  );
  if (!found) throw new Error("no pay button");
  return found as HTMLButtonElement;
}
const click = (el: HTMLElement) => act(() => el.click());
const sentBody = () => h.prepareDirectForm.mock.calls[0][0];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.listCards.mockResolvedValue({ data: [SAVED_CARD] });
  h.prepareDirectForm.mockResolvedValue({
    data: {
      paymentId: "pay-1",
      action: "https://www.paytr.com/odeme",
      method: "POST",
      fields: [{ name: "merchant_oid", value: "OID1" }],
      requireCvv: false,
      savedCard: true,
      status: "pending",
    },
  });
  // jsdom does not navigate: the PayTR post is only recorded.
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(
    h.formSubmit,
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("PaymentReady distance sales consent", () => {
  it.each<PaymentKind>(["boost", "membership"])(
    "%s: shows no contract checkbox and pays without it",
    async (kind) => {
      render(kind);
      await flush();

      expect(checkboxes()).toHaveLength(0);
      expect(container.textContent).not.toContain(
        "checkout.distanceSalesConsent",
      );
      expect(payButton().disabled).toBe(false);

      click(payButton());
      await flush();

      expect(h.prepareDirectForm).toHaveBeenCalledTimes(1);
      expect(sentBody()).toEqual({
        orderId: "order-1",
        paymentId: "pay-1",
        savedCardId: "card-1",
      });
      expect(sentBody()).not.toHaveProperty("distanceSalesAccepted");
      expect(h.formSubmit).toHaveBeenCalledTimes(1);
    },
  );

  it("checkout: requires the contract checkbox and sends the consent", async () => {
    render("checkout");
    await flush();

    expect(checkboxes()).toHaveLength(1);
    expect(container.textContent).toContain("checkout.distanceSalesConsent");
    expect(payButton().disabled).toBe(true);
    click(payButton());
    await flush();
    expect(h.prepareDirectForm).not.toHaveBeenCalled();

    click(checkboxes()[0]);
    expect(payButton().disabled).toBe(false);
    click(payButton());
    await flush();

    expect(h.prepareDirectForm).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({
      orderId: "order-1",
      paymentId: "pay-1",
      savedCardId: "card-1",
      distanceSalesAccepted: true,
    });
  });
});
