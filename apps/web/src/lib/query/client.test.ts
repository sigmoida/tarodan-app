/** @format */

import { MutationObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("@/lib/logger", () => ({
  logger: { captureException: h.capture },
}));

import { makeQueryClient } from "./client";

/**
 * Mutation hata raporlaması `MutationCache` üzerindedir. Eskiden
 * `defaultOptions.mutations.onError` idi ve TanStack mutation'ın kendi
 * seçeneklerini varsayılanların ÜSTÜNE sığ birleştirdiği için kendi `onError`'ı
 * olan her hook (useWebMutation, favori geri alması, …) raporu sessizce
 * eziyordu.
 */

/** React'siz tek mutation: hook'lar da aynı gözlemciyi kullanır. */
async function runFailing(
  options: {
    onError?: (error: unknown) => void;
    mutationKey?: readonly unknown[];
    meta?: Record<string, unknown>;
    onMutate?: () => unknown;
  },
  error: unknown = new Error("boom"),
) {
  const client = makeQueryClient();
  const observer = new MutationObserver(client, {
    ...options,
    mutationFn: () => Promise.reject(error),
  });
  await observer.mutate(undefined).catch(() => undefined);
  return error;
}

beforeEach(() => h.capture.mockReset());

describe("makeQueryClient — mutation hata raporu", () => {
  it("kendi onError'ı olan mutation'ın hatası da Sentry'ye gider", async () => {
    const own = vi.fn();

    const error = await runFailing({
      onError: own,
      mutationKey: ["wishlist-toggle"],
      meta: { page: "favorites" },
    });

    // Mutation'ın kendi onError'ı (toast, geri alma) da çalışmaya devam eder.
    expect(own).toHaveBeenCalledWith(
      error,
      undefined,
      undefined,
      expect.anything(),
    );
    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith(error, {
      source: "react-query",
      type: "mutation",
      mutationKey: ["wishlist-toggle"],
      meta: { page: "favorites" },
      context: undefined,
    });
  });

  it("onError'ı olmayan mutation bir kez raporlanır (çift rapor yok)", async () => {
    const error = await runFailing({});

    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ source: "react-query", type: "mutation" }),
    );
  });

  it("onMutate bağlamını rapora ekler", async () => {
    await runFailing({ onMutate: () => ({ productId: "p1" }) });

    expect(h.capture).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ context: { productId: "p1" } }),
    );
  });

  // Varsayılan eskiden de hiçbir hatayı elemiyordu; 4xx de raporlanır. Beklenen
  // sonuçlar (favoride 409/404) mutationFn içinde başarıya çevrilir.
  it("4xx iş hatasını da raporlar (eleme yok)", async () => {
    const error = await runFailing(
      {},
      { response: { status: 400, data: { message: "geçersiz" } } },
    );

    expect(h.capture).toHaveBeenCalledWith(error, expect.anything());
  });

  it("başarılı mutation raporlanmaz", async () => {
    const client = makeQueryClient();
    const observer = new MutationObserver(client, {
      mutationFn: async () => "ok",
    });

    await observer.mutate(undefined);

    expect(h.capture).not.toHaveBeenCalled();
  });
});
