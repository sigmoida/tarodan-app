// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import type { Offer } from "../_lib/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The counter amount is typed as text. A Turkish user writes "1.000" for one
 * thousand; `parseFloat` read it as 1 TL and "1.250,50" as 1.25 TL. The modal
 * must send the amount the shared TL parser reads, and refuse grouping
 * without calling the API.
 */
const h = vi.hoisted(() => ({
  post: vi.fn(),
  floor: null as number | null,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/api", () => ({ api: { post: h.post } }));
vi.mock("@/hooks/usePublicSettings", () => ({
  useOfferFloor: () => h.floor,
}));
vi.mock("@/hooks/useTimingPolicy", () => ({ useTimingValues: () => ({}) }));
vi.mock("@/components/ConfirmProvider", () => ({ useConfirm: () => vi.fn() }));

import CounterOfferModal from "./CounterOfferModal";

// The buyer's offer is 800 TL on a 2000 TL listing: a seller counter must be
// above 800 and at most the listing price.
const offer = {
  id: "o1",
  amount: 800,
  status: "pending",
  expiresAt: "2026-12-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
  product: { id: "p1", title: "Model car", price: 2000 },
} as Offer;

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

/** Render (or re-render) the modal; the floor mock is read on render. */
const mount = (mode: "buyer" | "seller") =>
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <CounterOfferModal open onClose={() => {}} offer={offer} mode={mode} />
      </QueryClientProvider>,
    ),
  );

beforeEach(() => {
  h.post.mockReset().mockResolvedValue({ data: {} });
  h.floor = null;
  vi.mocked(toast.error).mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  mount("seller");
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const amountInput = () =>
  document.body.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;

const sendButton = () =>
  Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent === "common.send",
  )!;

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
  await act(async () => {
    sendButton().click();
  });
};

describe("CounterOfferModal amount", () => {
  it("is a text field with the decimal keyboard", () => {
    expect(amountInput().type).toBe("text");
  });

  it.each([
    ["1000", 1000],
    ["1250,50", 1250.5],
  ])("sends %j as %j", async (text, amount) => {
    type(text);
    await send();
    expect(h.post).toHaveBeenCalledWith("/offers/o1/counter", { amount });
  });

  it.each(["1.000", "1.250,50"])(
    "refuses %j with the shared copy and no API call",
    async (text) => {
      type(text);
      expect(document.body.textContent).toContain("trade.cashFormatRefused");
      expect(sendButton().disabled).toBe(true);
      await send();
      expect(h.post).not.toHaveBeenCalled();
    },
  );
});

describe("CounterOfferModal bounds", () => {
  // Every refused bound shows its copy and never reaches the API.
  const refusedWith = (key: string) => {
    expect(toast.error).toHaveBeenCalledWith(key);
    expect(h.post).not.toHaveBeenCalled();
  };

  it("asks for an amount when the text reads as zero", async () => {
    type("0,00");
    expect(sendButton().disabled).toBe(false);
    await send();
    refusedWith("offer.counterModal.gecerliBirTutarGirin");
  });

  it("keeps Send disabled for blank text", () => {
    type("   ");
    expect(sendButton().disabled).toBe(true);
  });

  it("asks a seller counter to be above the buyer offer", async () => {
    type("800");
    await send();
    refusedWith(
      "offer.counterModal.karsiTeklifinizAlicininTeklifindenBaseLabelYuksek",
    );
  });

  it("sends a seller counter one kurus above the buyer offer", async () => {
    type("800,01");
    await send();
    expect(h.post).toHaveBeenCalledWith("/offers/o1/counter", {
      amount: 800.01,
    });
  });

  it("asks a buyer counter to be below the seller counter", async () => {
    mount("buyer");
    type("800");
    await send();
    refusedWith(
      "offer.counterModal.saticininKarsiTeklifindenBaseLabelDusukOlmalidir",
    );
  });

  it("sends a buyer counter one kurus below the seller counter", async () => {
    mount("buyer");
    type("799,99");
    await send();
    expect(h.post).toHaveBeenCalledWith("/offers/o1/buyer-counter", {
      amount: 799.99,
    });
  });

  it("holds the platform floor", async () => {
    h.floor = 900;
    mount("seller");
    type("899,99");
    await send();
    refusedWith("offer.counterBelowFloor");

    type("900");
    await send();
    expect(h.post).toHaveBeenCalledWith("/offers/o1/counter", { amount: 900 });
  });
});
