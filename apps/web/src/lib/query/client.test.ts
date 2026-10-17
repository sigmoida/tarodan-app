/** @format */

import { MutationObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("@/lib/logger", () => ({
  logger: { captureException: h.capture },
}));

import { makeQueryClient, shouldReportMutationError } from "./client";

/**
 * Mutation hata raporlaması `MutationCache` üzerindedir. Eskiden
 * `defaultOptions.mutations.onError` idi ve TanStack mutation'ın kendi
 * seçeneklerini varsayılanların ÜSTÜNE sığ birleştirdiği için kendi `onError`'ı
 * olan her hook (useWebMutation, favori geri alması, …) raporu sessizce
 * eziyordu. Beklenen iş hataları (4xx, 429 hariç) ve iptaller raporlanmaz;
 * rapora yalnız güvenli alanlar girer.
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
  const serverError = {
    message: "Request failed with status code 500",
    response: { status: 500, data: { message: "iç hata" } },
    config: { url: "/addresses/42?token=gizli", method: "post" },
  };

  it("kendi onError'ı olan mutation'ın hatası da Sentry'ye gider", async () => {
    const own = vi.fn();

    const error = await runFailing(
      {
        onError: own,
        mutationKey: ["addresses-create"],
        meta: { page: "addresses" },
      },
      serverError,
    );

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
      mutationKey: ["addresses-create"],
      status: 500,
      method: "POST",
      // Sorgu parametresi (token vb.) gönderilmez.
      endpoint: "/addresses/42",
    });
  });

  it("onError'ı olmayan mutation bir kez raporlanır (çift rapor yok)", async () => {
    await runFailing({});
    expect(h.capture).toHaveBeenCalledTimes(1);
  });

  // PII: değişkenler, onMutate anlık görüntüsü ve meta Sentry'ye gitmez.
  it("context ve meta rapora EKLENMEZ", async () => {
    await runFailing(
      {
        onMutate: () => ({ address: "Bağdat Cd. 1" }),
        meta: { email: "a@b.c" },
      },
      serverError,
    );

    const extra = h.capture.mock.calls[0][1] as Record<string, unknown>;
    expect(extra).not.toHaveProperty("context");
    expect(extra).not.toHaveProperty("meta");
    expect(JSON.stringify(extra)).not.toContain("Bağdat");
    expect(JSON.stringify(extra)).not.toContain("a@b.c");
  });

  it("ağ hatası (status yok) raporlanır", async () => {
    await runFailing({}, { message: "Network Error", code: "ERR_NETWORK" });
    expect(h.capture).toHaveBeenCalledTimes(1);
  });

  it("429 raporlanır (hız sınırına takılmak görülmeli)", async () => {
    await runFailing({}, { response: { status: 429 } });
    expect(h.capture).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 404, 409, 422])(
    "%i iş hatası raporlanmaz (kullanıcı girdisinin cevabı)",
    async (status) => {
      await runFailing({}, { response: { status } });
      expect(h.capture).not.toHaveBeenCalled();
    },
  );

  it("iptal raporlanmaz", async () => {
    await runFailing({}, { code: "ERR_CANCELED" });
    await runFailing({}, Object.assign(new Error("x"), { name: "AbortError" }));
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("meta.reportError=false mutation bazında raporu kapatır", async () => {
    await runFailing({ meta: { reportError: false } }, serverError);
    expect(h.capture).not.toHaveBeenCalled();
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

describe("shouldReportMutationError", () => {
  it("5xx ve status'süz hatayı raporlar, 4xx'i (429 hariç) raporlamaz", () => {
    expect(shouldReportMutationError({ response: { status: 503 } })).toBe(true);
    expect(shouldReportMutationError(new Error("boom"))).toBe(true);
    expect(shouldReportMutationError({ response: { status: 429 } })).toBe(true);
    expect(shouldReportMutationError({ response: { status: 403 } })).toBe(
      false,
    );
  });
});
