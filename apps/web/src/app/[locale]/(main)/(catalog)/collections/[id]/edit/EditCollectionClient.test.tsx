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

import { collectionsApi } from "@/lib/api";
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

  it("prefers the API's localized message over the generic failure copy", async () => {
    h.confirm.mockResolvedValue(true);
    h.removeItem.mockRejectedValue({
      response: { data: { message: "Localized by the API" } },
    });
    await act(async () => removeButton(rows()[0]).click());
    await flush();
    expect(h.toastError).toHaveBeenCalledWith("Localized by the API");
  });

  it("keeps both rows busy while two removals overlap", async () => {
    h.confirm.mockResolvedValue(true);
    const settle: Array<() => void> = [];
    h.removeItem.mockImplementation(
      () => new Promise<void>((resolve) => settle.push(resolve)),
    );
    await act(async () => removeButton(rows()[0]).click());
    await act(async () => removeButton(rows()[1]).click());
    await flush();

    expect(h.removeItem).toHaveBeenCalledTimes(2);
    expect(removeButton(rows()[0]).disabled).toBe(true);
    expect(removeButton(rows()[1]).disabled).toBe(true);
    expect(removeButton(rows()[2]).disabled).toBe(false);

    settle.forEach((resolve) => resolve());
    await flush();
    expect(removeButton(rows()[0]).disabled).toBe(false);
  });

  it("keeps the row busy until the refresh has dropped it", async () => {
    h.confirm.mockResolvedValue(true);
    h.removeItem.mockResolvedValue({});
    let finishRefetch = () => {};
    vi.mocked(collectionsApi.getOne).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefetch = () =>
            resolve({
              data: {
                collection: { ...base, items: [item({ id: "i1" })] },
              },
            } as never);
        }),
    );
    await act(async () => removeButton(rows()[0]).click());
    await flush();

    // The DELETE is done and toasted; the old row must not offer a second one.
    expect(h.toastSuccess).toHaveBeenCalledWith("collection.productRemoved");
    expect(rows()).toHaveLength(3);
    expect(removeButton(rows()[0]).disabled).toBe(true);

    await act(async () => finishRefetch());
    await flush();
    expect(rows()).toHaveLength(1);
    expect(removeButton(rows()[0]).disabled).toBe(false);
  });

  it("keeps the form and the list when the refresh after a removal fails", async () => {
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
    vi.mocked(collectionsApi.getOne).mockRejectedValueOnce(new Error("down"));
    await act(async () => removeButton(rows()[0]).click());
    await flush();

    expect(rows()).toHaveLength(3);
    expect(
      (container.querySelector('input[name="name"]') as HTMLInputElement).value,
    ).toBe("Edited name");
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
