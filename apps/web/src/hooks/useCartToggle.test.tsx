// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  lines: [] as Array<{ productId: string }>,
  addToCart: vi.fn(),
  removeFromCart: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/logger", () => ({ logger: { captureException: vi.fn() } }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/hooks/useCart", () => ({
  useCart: () => ({
    lines: h.lines,
    addToCart: h.addToCart,
    removeFromCart: h.removeFromCart,
  }),
}));

import { useCartToggle } from "./useCartToggle";
import { makeQueryClient } from "@/lib/query/client";

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let cart: ReturnType<typeof useCartToggle>;

function render(productId = "p1") {
  function Harness() {
    cart = useCartToggle(productId);
    return null;
  }
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 3; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  client = makeQueryClient();
  h.lines = [];
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  h.addToCart.mockReset().mockResolvedValue(undefined);
  h.removeFromCart.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

describe("useCartToggle", () => {
  it("adds a listing that is not in the cart", async () => {
    render();
    expect(cart.inCart).toBe(false);

    act(() => cart.toggle());
    await flush();

    expect(h.addToCart).toHaveBeenCalledWith("p1");
    expect(h.removeFromCart).not.toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith("product.addedToCart");
  });

  it("removes a listing that is in the cart (guest or authed line alike)", async () => {
    h.lines = [{ productId: "other" }, { productId: "p1" }];
    render();
    expect(cart.inCart).toBe(true);

    act(() => cart.toggle());
    await flush();

    expect(h.removeFromCart).toHaveBeenCalledWith("p1");
    expect(h.addToCart).not.toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith("product.removedFromCart");
  });

  it("only this listing's line counts as in the cart", async () => {
    h.lines = [{ productId: "other" }];
    render();
    expect(cart.inCart).toBe(false);

    act(() => cart.toggle());
    await flush();

    expect(h.addToCart).toHaveBeenCalledWith("p1");
    expect(h.removeFromCart).not.toHaveBeenCalled();
  });

  it("shows no error for a cancelled write", async () => {
    h.addToCart.mockRejectedValue(
      Object.assign(new Error("canceled"), { code: "ERR_CANCELED" }),
    );
    render();

    act(() => cart.toggle());
    await flush();

    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("ignores a second click while the write runs", async () => {
    let finish!: () => void;
    h.addToCart.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render();

    act(() => cart.toggle());
    await flush();
    expect(cart.isPending).toBe(true);
    act(() => cart.toggle());
    await flush();
    expect(h.addToCart).toHaveBeenCalledTimes(1);

    finish();
    await flush();
    expect(cart.isPending).toBe(false);
  });

  it("toasts the reason useCart rethrew for an add, and keeps the state", async () => {
    h.addToCart.mockRejectedValue(new Error("Yetersiz stok"));
    render();

    act(() => cart.toggle());
    await flush();

    expect(h.toast.error).toHaveBeenCalledTimes(1);
    expect(h.toast.error).toHaveBeenCalledWith("Yetersiz stok");
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(cart.inCart).toBe(false);
  });

  it("toasts the API message of a failed remove, never axios' own text", async () => {
    h.lines = [{ productId: "p1" }];
    h.removeFromCart.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 409"), {
        isAxiosError: true,
        response: { data: { message: "Sepet kilitli" } },
      }),
    );
    render();
    act(() => cart.toggle());
    await flush();
    expect(h.toast.error).toHaveBeenLastCalledWith("Sepet kilitli");

    h.removeFromCart.mockRejectedValueOnce(
      Object.assign(new Error("Network Error"), { isAxiosError: true }),
    );
    act(() => cart.toggle());
    await flush();
    expect(h.toast.error).toHaveBeenLastCalledWith("common.operationFailed");
  });
});
