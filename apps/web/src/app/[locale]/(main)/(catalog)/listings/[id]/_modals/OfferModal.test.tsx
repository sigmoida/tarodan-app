// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "@tarodan/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The make-offer amount was a `type="number"` field read with `parseFloat`,
 * so "1.000" (one thousand to a Turkish user) was 1 TL. It is a text field
 * read by the shared TL amount parser: the request carries the parsed amount
 * and refused text never reaches the API.
 */
const h = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
// The schema translates with the real catalog (`createTranslator`).
vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl")>()),
  useTranslations: () => (k: string) => k,
}));
vi.mock("@/lib/api", () => ({ offersApi: { create: h.create } }));
vi.mock("@/hooks/usePublicSettings", () => ({ useOfferFloor: () => null }));
vi.mock("../_context/ListingDetailContext", () => ({
  useListingDetail: () => ({
    t: (k: string) => k,
    locale: "tr",
    listing: { id: "p1" },
    // 2000 TL listing: offers from 1000 TL up to (not including) 2000 TL.
    effectivePrice: 2000,
    showOfferModal: true,
    setShowOfferModal: vi.fn(),
  }),
}));

import OfferModal from "./OfferModal";

const REFUSED =
  "Tutar kabul edilmedi. Binlik ayracı kullanmayın; kuruş için virgül kullanın, örn. 1250,50";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  h.create.mockReset().mockResolvedValue({ data: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <ConfirmProvider>
          <OfferModal />
        </ConfirmProvider>
      </QueryClientProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const amountInput = () =>
  document.body.querySelector<HTMLInputElement>('input[name="amount"]')!;

const type = (text: string) => {
  const input = amountInput();
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const send = async () => {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent === "product.sendOffer",
  )!;
  await act(async () => {
    button.click();
  });
};

describe("OfferModal amount", () => {
  it("is a text field with the decimal keyboard", () => {
    expect(amountInput().type).toBe("text");
    expect(amountInput().inputMode).toBe("decimal");
  });

  it.each([
    ["1000", 1000],
    ["1250,50", 1250.5],
  ])("sends %j as %j", async (text, amount) => {
    type(text);
    await send();
    expect(h.create).toHaveBeenCalledWith({
      productId: "p1",
      amount,
      message: undefined,
    });
  });

  it.each(["1.000", "1.250,50"])(
    "refuses %j with the shared copy and no API call",
    async (text) => {
      type(text);
      await send();
      expect(document.body.textContent).toContain(REFUSED);
      expect(h.create).not.toHaveBeenCalled();
    },
  );
});
