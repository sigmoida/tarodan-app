// @vitest-environment jsdom
/** @format */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const COL_ID = vi.hoisted(() => "0b9f0a52-3c1e-4d57-8a41-5a7d9f1c2e10");
const h = vi.hoisted(() => ({
  collection: null as unknown,
  confirm: vi.fn(),
  removeItem: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "tr",
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: COL_ID }) }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({
    user: { id: "me" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));
vi.mock("@/components/AuthLoadingScreen", () => ({ default: () => null }));
vi.mock("@/components/ConfirmProvider", () => ({
  useConfirm: () => h.confirm,
}));
vi.mock("react-hot-toast", () => ({
  default: { success: h.toastSuccess, error: h.toastError },
}));
vi.mock("@/lib/query/client", () => ({ isCancellation: () => false }));
vi.mock("@/lib/api", () => ({
  collectionsApi: {
    getOne: vi.fn(async () => ({ data: { collection: h.collection } })),
    getBySlug: vi.fn(),
    removeItem: (...args: unknown[]) => h.removeItem(...args),
  },
}));
vi.mock("./_hooks/useCategoryOptions", () => ({
  useCategoryOptions: () => [],
}));
// The `@/components/ui` barrel pulls a `server-only` chain; the card is enough.
vi.mock("@/components/ui", async () => ({
  SectionCard: (await import("@/components/ui/SectionCard")).default,
}));
vi.mock("@/components/OptimizedImage", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid="item-image" data-src={src}>
      {alt}
    </span>
  ),
  isValidImageSrc: (src: unknown) =>
    typeof src === "string" && src.startsWith("https://"),
}));

import EditCollectionClient from "./EditCollectionClient";

const base = {
  id: COL_ID,
  userId: "me",
  userName: "Me",
  name: "My cars",
  slug: "my-cars",
  description: "",
  isPublic: true,
  viewCount: 0,
  likeCount: 0,
  itemCount: 3,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

const item = (over: Record<string, unknown>) => ({
  id: "i1",
  productId: "p1",
  productTitle: "Camaro",
  productImage: "https://cdn.example/a.webp",
  productPrice: 100,
  productStatus: "active",
  sortOrder: 0,
  isFeatured: false,
  addedAt: "2026-01-01",
  isCustom: false,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const flush = async () => {
  for (let i = 0; i < 10; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
};

beforeEach(async () => {
  vi.clearAllMocks();
  h.collection = {
    ...base,
    items: [
      item({ id: "i1", sortOrder: 1 }),
      item({
        id: "hidden",
        productTitle: "Hidden one",
        productStatus: "hidden",
        sortOrder: 0,
      }),
      item({
        id: "bare",
        productTitle: "",
        productImage: undefined,
        productStatus: "deleted",
        sortOrder: 2,
      }),
    ],
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <EditCollectionClient />
      </QueryClientProvider>,
    ),
  );
  await flush();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const rows = () => Array.from(container.querySelectorAll("li"));
const removeButton = (row: Element) =>
  row.querySelector("button") as HTMLButtonElement;

describe("EditCollectionClient item list", () => {
  it("lists every item for the owner, hidden and deleted too, with safe fallbacks", () => {
    expect(rows()).toHaveLength(3);
    const text = rows().map((r) => r.textContent);
    expect(text[0]).toContain("Hidden one");
    expect(text[2]).toContain("collection.untitledItem");
    // The item without an image renders no <img>.
    expect(rows()[2].querySelector('[data-testid="item-image"]')).toBeNull();
    expect(
      rows()[1].querySelector('[data-testid="item-image"]'),
    ).not.toBeNull();
    // No price is ever shown.
    expect(text.join(" ")).not.toContain("100");
  });

  it("removes a hidden item after confirmation, with the success toast", async () => {
    h.confirm.mockResolvedValue(true);
    h.removeItem.mockResolvedValue({});
    await act(async () => removeButton(rows()[0]).click());
    await flush();
    expect(h.removeItem).toHaveBeenCalledWith(COL_ID, "hidden");
    expect(h.toastSuccess).toHaveBeenCalledWith("collection.productRemoved");
  });

  it("makes no call when the confirmation is cancelled", async () => {
    h.confirm.mockResolvedValue(false);
    await act(async () => removeButton(rows()[0]).click());
    await flush();
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.removeItem).not.toHaveBeenCalled();
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it("shows the error toast when the delete fails", async () => {
    h.confirm.mockResolvedValue(true);
    h.removeItem.mockRejectedValue(new Error("boom"));
    await act(async () => removeButton(rows()[0]).click());
    await flush();
    expect(h.toastError).toHaveBeenCalledWith("collection.productRemoveFailed");
  });

  it("keeps unsaved form edits after a removal refreshes the data", async () => {
    const input = container.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setValue.call(input, "Edited name");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    h.confirm.mockResolvedValue(true);
    h.removeItem.mockResolvedValue({});
    // The refetch after the removal returns the collection without that item.
    h.collection = {
      ...base,
      items: [item({ id: "i1", sortOrder: 1 })],
    };
    await act(async () => removeButton(rows()[0]).click());
    await flush();

    expect(rows()).toHaveLength(1);
    expect(
      (container.querySelector('input[name="name"]') as HTMLInputElement).value,
    ).toBe("Edited name");
  });
});
