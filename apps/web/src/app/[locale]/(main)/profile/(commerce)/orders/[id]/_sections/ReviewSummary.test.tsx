// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrderOwnReview } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ getMyReview: vi.fn() }));

vi.mock("@/lib/api", () => ({ ordersApi: { getMyReview: h.getMyReview } }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/ui", () => ({
  SectionCard: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock("../_lib/types", () => ({ hasReviewed: () => true }));

import ReviewSummary from "./ReviewSummary";

const NOTE_KEY = "order.review.hiddenNote";

const productReview = (hidden: boolean): OrderOwnReview["product"] => ({
  score: 4,
  title: "Great",
  review: "Works well",
  images: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  hidden,
});

const sellerReview = (hidden: boolean): OrderOwnReview["seller"] => ({
  score: 5,
  comment: "Fast shipping",
  createdAt: "2026-10-01T00:00:00.000Z",
  hidden,
});

let root: Root | undefined;
let host: HTMLElement | undefined;

async function renderSummary(data: OrderOwnReview): Promise<string> {
  h.getMyReview.mockResolvedValue({ data });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <ReviewSummary order={{ id: "order-1" } as never} />
      </QueryClientProvider>,
    );
  });
  // Let the query settle: poll until the review content is on screen.
  for (let i = 0; i < 20 && !host.textContent; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  return host.textContent ?? "";
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = undefined;
  vi.clearAllMocks();
});

describe("ReviewSummary hidden note", () => {
  it("shows the note once per hidden review and keeps the content", async () => {
    const text = await renderSummary({
      product: productReview(true),
      seller: sellerReview(true),
    });

    expect(text.split(NOTE_KEY)).toHaveLength(3);
    expect(text).toContain("Works well");
    expect(text).toContain("Fast shipping");
  });

  it("flags only the review that is hidden", async () => {
    const text = await renderSummary({
      product: productReview(true),
      seller: sellerReview(false),
    });

    expect(text.split(NOTE_KEY)).toHaveLength(2);
  });

  it("shows no note for a public review", async () => {
    const text = await renderSummary({
      product: productReview(false),
      seller: sellerReview(false),
    });

    expect(text).toContain("Works well");
    expect(text).not.toContain(NOTE_KEY);
  });
});
