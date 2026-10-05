// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptySendForm, type SendForm } from "./types";

const previewBroadcastEmail = vi.fn();
const countNotificationAudience = vi.fn();

vi.mock("@/lib/api", () => ({
  adminApi: {
    previewBroadcastEmail: (...args: unknown[]) =>
      previewBroadcastEmail(...args),
    countNotificationAudience: (...args: unknown[]) =>
      countNotificationAudience(...args),
  },
}));

import {
  useAudienceCounts,
  useBroadcastEmailPreview,
} from "./useBroadcastEmailPreview";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let renders = 0;
function Probe({ values }: { values: SendForm }) {
  renders += 1;
  useBroadcastEmailPreview(values);
  useAudienceCounts(values);
  return null;
}

describe("useBroadcastEmailPreview", () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;

  const render = (values: SendForm) =>
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe values={values} />
        </QueryClientProvider>,
      );
    });

  beforeEach(() => {
    vi.useFakeTimers();
    renders = 0;
    previewBroadcastEmail.mockReset().mockResolvedValue({
      data: { subject: "s", html: "<p>x</p>" },
    });
    countNotificationAudience
      .mockReset()
      .mockResolvedValue({ data: { total: 3, marketing: 1 } });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  const typed: SendForm = {
    ...emptySendForm,
    title: "T",
    body: "B",
    channels: ["email"],
    emailSubject: "Konu",
    emailHtml: "<h1>Selam</h1>",
  };

  it("debounce sonrası istek YAZILAN HTML ile gider (yeni nesne her render'da verilse de)", async () => {
    // Her render yeni `values` nesnesi: eski hata burada zamanlayıcıyı sıfırlıyordu.
    render({ ...typed });
    render({ ...typed });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(previewBroadcastEmail).toHaveBeenCalledTimes(1);
    expect(previewBroadcastEmail.mock.calls[0][0]).toMatchObject({
      emailHtml: "<h1>Selam</h1>",
      emailSubject: "Konu",
    });
  });

  it("boş HTML iken önizleme isteği atılmaz", async () => {
    render({ ...typed, emailHtml: "" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(previewBroadcastEmail).not.toHaveBeenCalled();
  });

  it("boştaki form sürekli yeniden render olmaz", async () => {
    render(typed);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    const settled = renders;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(renders).toBe(settled);
  });
});
