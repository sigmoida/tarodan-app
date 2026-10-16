// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  auth: { isAuthenticated: true, user: { id: "me" } as { id: string } | null },
  api: {
    get: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
  capture: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ wishlistApi: h.api }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: typeof h.auth) => unknown) => selector(h.auth),
}));
vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/logger", () => ({
  logger: { captureException: h.capture },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import {
  useProductFavorite,
  useToggleWishlist,
  useWishlistIds,
} from "./useWishlist";
import { queryKeys } from "@/lib/query/keys";
import type { WishlistEntry } from "@/lib/wishlist";

/** Elle çözülen istek — iyimser durumu yanıt gelmeden ölçmek için. */
function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const row = (productId: string): WishlistEntry => ({
  id: `w-${productId}`,
  productId,
  productTitle: `Ürün ${productId}`,
});

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let ids: ReadonlySet<string>;
let toggle: ReturnType<typeof useToggleWishlist>;
let favorite: ReturnType<typeof useProductFavorite>;
const requireAuth = vi.fn();
let isOwner = false;

function Harness({ productId = "p1" }: { productId?: string }) {
  ids = useWishlistIds();
  toggle = useToggleWishlist();
  favorite = useProductFavorite(productId, { isOwner, requireAuth });
  return null;
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function render() {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
  await flush();
}

/**
 * Hatadan sonraki liste tazelemesini askıda bırakır: önbellekte kalan değer
 * sunucudan gelen değil, GERİ ALMANIN kendisi olsun.
 */
const hangRefetch = () =>
  h.api.get.mockReturnValue(new Promise(() => undefined));

const cached = () =>
  client.getQueryData<WishlistEntry[]>(queryKeys.wishlist.all());

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  h.auth.isAuthenticated = true;
  h.auth.user = { id: "me" };
  h.api.get.mockReset().mockResolvedValue({ data: { items: [row("p0")] } });
  h.api.add.mockReset().mockResolvedValue({ status: 201, data: row("p1") });
  h.api.remove.mockReset().mockResolvedValue({ status: 200 });
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  h.capture.mockReset();
  requireAuth.mockReset().mockReturnValue(true);
  isOwner = false;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
});

describe("useWishlistIds", () => {
  it("misafirde favori sorgusu hiç atılmaz", async () => {
    h.auth.isAuthenticated = false;
    await render();
    expect(h.api.get).not.toHaveBeenCalled();
    expect(ids.size).toBe(0);
  });

  it("çıkış sonrası önbellekte kalan listeyi göstermez", async () => {
    // Önceki oturumdan kalan liste; sorgu misafirde kapalı olsa da önbellekte.
    client.setQueryData(queryKeys.wishlist.all(), [row("p0")]);
    h.auth.isAuthenticated = false;
    await render();
    expect(ids.size).toBe(0);
    expect(favorite.isFavorite).toBe(false);
  });

  it("GET /wishlist yanıtından id kümesi türetir", async () => {
    await render();
    expect(h.api.get).toHaveBeenCalledTimes(1);
    expect(ids.has("p0")).toBe(true);
    expect(ids.has("p1")).toBe(false);
  });
});

describe("useToggleWishlist", () => {
  it("ekleme iyimserdir: kalp istek bitmeden dolar, sonra liste tazelenir", async () => {
    const req = deferred();
    h.api.add.mockReturnValue(req.promise);
    await render();

    act(() => {
      toggle("p1", false);
    });
    await flush();
    expect(h.api.add).toHaveBeenCalledWith("p1");
    expect(ids.has("p1")).toBe(true);
    expect(favorite.isFavorite).toBe(true);

    h.api.get.mockResolvedValue({ data: { items: [row("p1"), row("p0")] } });
    await act(async () => req.resolve({ status: 201, data: row("p1") }));
    await flush();
    expect(h.toast.success).toHaveBeenCalledWith("product.addedToFavorites");
    // Tazeleme: ilk yükleme + toggle sonrası.
    expect(h.api.get).toHaveBeenCalledTimes(2);
    expect(ids.has("p1")).toBe(true);
  });

  it("ekleme başarısızsa yalnız o ürünü geri alır ve hata gösterir", async () => {
    h.api.add.mockRejectedValue({
      response: { status: 500, data: { message: "sunucu hatası" } },
    });
    await render();
    hangRefetch();

    act(() => {
      toggle("p1", false);
    });
    await flush();
    expect(ids.has("p1")).toBe(false);
    expect(ids.has("p0")).toBe(true);
    expect(h.toast.error).toHaveBeenCalledWith("sunucu hatası");
    // Varsayılan mutation hata raporlaması ezildiği için Sentry'ye biz yollarız.
    expect(h.capture).toHaveBeenCalledWith(
      expect.objectContaining({ response: expect.anything() }),
      expect.objectContaining({ source: "react-query", type: "mutation" }),
    );
  });

  it("çıkarma başarısızsa asıl satırı geri koyar", async () => {
    h.api.remove.mockRejectedValue(new Error("ağ"));
    await render();
    hangRefetch();
    act(() => {
      toggle("p0", true);
    });
    await flush();
    expect(cached()).toEqual([row("p0")]);
    expect(h.toast.error).toHaveBeenCalledWith("common.operationFailed");
  });

  it("409 (zaten favoride) başarı sayılır, geri alınmaz", async () => {
    const req = deferred();
    h.api.add.mockReturnValue(req.promise);
    await render();
    act(() => {
      toggle("p1", false);
    });
    await flush();
    h.api.get.mockResolvedValue({ data: { items: [row("p1"), row("p0")] } });
    await act(async () => req.reject({ response: { status: 409 } }));
    await flush();
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith("product.addedToFavorites");
    expect(ids.has("p1")).toBe(true);
  });

  it("çıkarırken 404 (zaten favoride değil) başarı sayılır, geri alınmaz", async () => {
    h.api.remove.mockRejectedValue({ response: { status: 404 } });
    await render();
    hangRefetch();
    act(() => {
      toggle("p0", true);
    });
    await flush();
    expect(ids.has("p0")).toBe(false);
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith(
      "product.removedFromFavorites",
    );
  });

  it("aynı ürün için istek sürerken ikinci tıklamayı yok sayar", async () => {
    const req = deferred();
    h.api.add.mockReturnValue(req.promise);
    await render();

    let first = false;
    let second = true;
    act(() => {
      first = toggle("p1", false);
      // Aynı tick'te ikinci tıklama (çift tık) — henüz render olmadı.
      second = toggle("p1", true);
    });
    await flush();
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(h.api.add).toHaveBeenCalledTimes(1);
    expect(h.api.remove).not.toHaveBeenCalled();

    await act(async () => req.resolve({ status: 201 }));
    await flush();
  });

  it("farklı ürünler aynı anda favorilenebilir", async () => {
    const a = deferred();
    const b = deferred();
    h.api.add.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    await render();
    act(() => {
      toggle("p1", false);
      toggle("p2", false);
    });
    await flush();
    expect(h.api.add).toHaveBeenCalledTimes(2);
    expect(ids.has("p1") && ids.has("p2")).toBe(true);

    // İlki biterken diğeri sürüyor: liste henüz tazelenmez (p2'nin iyimser
    // değeri ezilmesin).
    await act(async () => a.resolve({ status: 201 }));
    await flush();
    expect(h.api.get).toHaveBeenCalledTimes(1);
    expect(ids.has("p2")).toBe(true);

    h.api.get.mockResolvedValue({
      data: { items: [row("p2"), row("p1"), row("p0")] },
    });
    await act(async () => b.resolve({ status: 201 }));
    await flush();
    expect(h.api.get).toHaveBeenCalledTimes(2);
  });
});

describe("useProductFavorite", () => {
  it("misafirde giriş penceresini açar, istek atmaz", async () => {
    requireAuth.mockReturnValue(false);
    await render();
    act(() => favorite.toggle());
    await flush();
    expect(requireAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "product.addToFavorites",
        message: "auth.memberBenefits",
      }),
    );
    expect(h.api.add).not.toHaveBeenCalled();
  });

  it("kendi ürününde uyarı verir, istek atmaz", async () => {
    isOwner = true;
    await render();
    act(() => favorite.toggle());
    await flush();
    expect(h.toast.error).toHaveBeenCalledWith("product.cannotFavoriteOwn");
    expect(h.api.add).not.toHaveBeenCalled();
  });

  it("favorideki ürünü çıkarır", async () => {
    h.api.get.mockResolvedValue({ data: { items: [row("p1")] } });
    await render();
    expect(favorite.isFavorite).toBe(true);
    h.api.get.mockResolvedValue({ data: { items: [] } });
    act(() => favorite.toggle());
    await flush();
    expect(h.api.remove).toHaveBeenCalledWith("p1");
    expect(favorite.isFavorite).toBe(false);
    expect(h.toast.success).toHaveBeenCalledWith(
      "product.removedFromFavorites",
    );
  });
});
