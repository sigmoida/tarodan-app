// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Kart kalbi GERÇEK `useWishlist` hook'larıyla, sahte API üzerinden sürülür:
 * misafir / sahip / normal kullanıcı, iyimser dolma ve hata sonrası geri alma.
 */

const h = vi.hoisted(() => ({
  auth: { isAuthenticated: true, user: { id: "me" } as { id: string } | null },
  gate: vi.fn(),
  api: { get: vi.fn(), add: vi.fn(), remove: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api", () => ({ wishlistApi: h.api }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: typeof h.auth) => unknown) => selector(h.auth),
}));
vi.mock("@/hooks/useAuthGate", () => ({
  useAuthGate: () => ({
    requireAuth: (cfg: unknown) => {
      if (h.auth.isAuthenticated) return true;
      h.gate(cfg);
      return false;
    },
    authModal: null,
  }),
}));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/logger", () => ({ logger: { captureException: vi.fn() } }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import ProductCardFavorite from "./ProductCardFavorite";

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const parentClick = vi.fn();

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function render(sellerId: string | null = "seller-1") {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        {/* Kartın kendisi: kalbe tıklama buraya ulaşmamalı. */}
        <div onClick={parentClick}>
          <ProductCardFavorite productId="p1" sellerId={sellerId} />
        </div>
      </QueryClientProvider>,
    ),
  );
  await flush();
}

const heart = () => container.querySelector("button");
const click = async () => {
  act(() => {
    heart()!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  await flush();
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  h.auth.isAuthenticated = true;
  h.auth.user = { id: "me" };
  h.gate.mockReset();
  h.api.get.mockReset().mockResolvedValue({ data: { items: [] } });
  h.api.add.mockReset().mockResolvedValue({ status: 201 });
  h.api.remove.mockReset().mockResolvedValue({ status: 200 });
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  parentClick.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
});

describe("ProductCardFavorite", () => {
  it("misafire boş kalp çizer, favori sorgusu atmaz, tıklamada giriş ister", async () => {
    h.auth.isAuthenticated = false;
    h.auth.user = null;
    await render();
    expect(heart()?.getAttribute("aria-pressed")).toBe("false");
    expect(heart()?.getAttribute("aria-label")).toBe("product.favorite");
    expect(h.api.get).not.toHaveBeenCalled();

    await click();
    expect(h.gate).toHaveBeenCalledTimes(1);
    expect(h.api.add).not.toHaveBeenCalled();
  });

  it("kendi ilanında kalp hiç çizilmez", async () => {
    await render("me");
    expect(heart()).toBeNull();
  });

  it("favorideki ürünü basılı gösterir; etiket durumla değişmez", async () => {
    h.api.get.mockResolvedValue({ data: { items: [{ productId: "p1" }] } });
    await render();
    expect(heart()?.getAttribute("aria-pressed")).toBe("true");
    // Durumu aria-pressed söyler; değişen etiket "çıkar, basılı" diye
    // çelişik okunurdu.
    expect(heart()?.getAttribute("aria-label")).toBe("product.favorite");
  });

  it("tıklama iyimser doldurur ve kartın tıklamasını tetiklemez", async () => {
    let resolveAdd!: (v: unknown) => void;
    h.api.add.mockReturnValue(new Promise((r) => (resolveAdd = r)));
    await render();

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      heart()!.dispatchEvent(event);
    });
    await flush();

    expect(event.defaultPrevented).toBe(true);
    expect(parentClick).not.toHaveBeenCalled();
    expect(h.api.add).toHaveBeenCalledWith("p1");
    // Yanıt gelmeden dolu.
    expect(heart()?.getAttribute("aria-pressed")).toBe("true");

    h.api.get.mockResolvedValue({ data: { items: [{ productId: "p1" }] } });
    await act(async () => resolveAdd({ status: 201 }));
    await flush();
    expect(heart()?.getAttribute("aria-pressed")).toBe("true");
    expect(h.toast.success).toHaveBeenCalledWith("product.addedToFavorites");
  });

  it("istek başarısızsa kalbi geri boşaltır ve hata gösterir", async () => {
    h.api.add.mockRejectedValue({ response: { status: 500 } });
    await render();
    // Hata sonrası tazeleme askıda: görülen değer geri almanın kendisi.
    h.api.get.mockReturnValue(new Promise(() => undefined));

    await click();
    expect(heart()?.getAttribute("aria-pressed")).toBe("false");
    expect(h.toast.error).toHaveBeenCalledWith("common.operationFailed");
  });
});
