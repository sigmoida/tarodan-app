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
  capture: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({ default: h.toast }));
vi.mock("@/lib/logger", () => ({
  logger: { captureException: h.capture },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { useWebMutation, type UseWebMutationOptions } from "./useWebMutation";
import { makeQueryClient } from "@/lib/query/client";

/**
 * useWebMutation kendi `onError`'ını (toast) verir. Sentry raporu uygulamanın
 * GERÇEK QueryClient'ındaki `MutationCache`'ten gelir — bu yüzden testler
 * `makeQueryClient()` ile koşar: eskiden mutation düzeyindeki `onError`
 * varsayılan raporu eziyordu ve useWebMutation hataları Sentry'ye hiç
 * gitmiyordu.
 */

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let mutation: ReturnType<typeof useWebMutation<unknown, void>>;

function render(
  mutationFn: () => Promise<unknown>,
  options?: UseWebMutationOptions<unknown, void>,
) {
  function Harness() {
    mutation = useWebMutation(mutationFn, options);
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

async function run() {
  await act(async () => {
    await mutation.mutateAsync().catch(() => undefined);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = makeQueryClient();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  h.capture.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
});

describe("useWebMutation — hata", () => {
  const serverError = {
    response: { status: 500, data: { message: "sunucu hatası" } },
  };
  const validationError = {
    response: { status: 422, data: { message: "geçersiz" } },
  };

  it("sunucu hatasını hem toast'lar hem Sentry'ye raporlar", async () => {
    render(() => Promise.reject(serverError));
    await run();

    expect(h.toast.error).toHaveBeenCalledWith("sunucu hatası");
    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith(
      serverError,
      expect.objectContaining({
        source: "react-query",
        type: "mutation",
        status: 500,
      }),
    );
  });

  // Doğrulama hatası kullanıcının girdisine verilen cevaptır: toast evet,
  // Sentry hayır (kota/gürültü).
  it("4xx iş hatasını toast'lar ama raporlamaz", async () => {
    render(() => Promise.reject(validationError));
    await run();

    expect(h.toast.error).toHaveBeenCalledWith("geçersiz");
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("silentError toast'u bastırır ama raporu bastırmaz", async () => {
    render(() => Promise.reject(serverError), { silentError: true });
    await run();

    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.capture).toHaveBeenCalledTimes(1);
  });

  it("sunucu mesajı yoksa çağıranın metnine, o da yoksa genel metne düşer", async () => {
    render(() => Promise.reject(new Error("ağ")), { errorMessage: "olmadı" });
    await run();
    expect(h.toast.error).toHaveBeenLastCalledWith("olmadı");

    render(() => Promise.reject(new Error("ağ")));
    await run();
    expect(h.toast.error).toHaveBeenLastCalledWith("common.operationFailed");
  });
});

describe("useWebMutation — başarı", () => {
  it("kaynakları tazeler, başarı toast'u gösterir, rapor üretmez", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onSuccess = vi.fn();
    render(async () => "ok", {
      invalidates: ["addresses"],
      successMessage: "kaydedildi",
      onSuccess,
    });
    await run();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["addresses"] });
    expect(h.toast.success).toHaveBeenCalledWith("kaydedildi");
    expect(onSuccess).toHaveBeenCalledWith("ok", undefined);
    expect(h.capture).not.toHaveBeenCalled();
  });
});
