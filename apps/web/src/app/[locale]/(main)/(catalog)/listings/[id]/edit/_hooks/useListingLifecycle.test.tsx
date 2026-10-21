// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import type { EditListingValues } from "@tarodan/listing-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  listingsApi: { update: vi.fn(), deactivate: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/api", () => ({ listingsApi: h.listingsApi }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({
    refreshUserData: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { captureException: vi.fn() } }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { makeQueryClient } from "@/lib/query/client";
import { queryKeys, webKeys } from "@/lib/query/keys";
import { useListingLifecycle } from "./useListingLifecycle";

/** The trade picker's real key: per user and per target listing. */
const PICKER_KEY = webKeys.list(queryKeys.tradeEligible.resource, {
  userId: "u1",
  listingId: "t1",
});
const DETAIL_KEY = queryKeys.product.detail("p1");

const form = {
  watch: () => undefined,
  setValue: vi.fn(),
} as unknown as UseFormReturn<EditListingValues>;

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let lifecycle: ReturnType<typeof useListingLifecycle>;

function Harness() {
  lifecycle = useListingLifecycle({ id: "p1", form, setIsLoading: vi.fn() });
  return null;
}

async function waitFor(assertion: () => void) {
  let last: unknown;
  for (let i = 0; i < 50; i++) {
    try {
      assertion();
      return;
    } catch (e) {
      last = e;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
  }
  throw last;
}

beforeEach(() => {
  h.listingsApi.update.mockResolvedValue({ data: { status: "pending" } });
  h.listingsApi.deactivate.mockResolvedValue({});
  h.listingsApi.delete.mockResolvedValue({});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = makeQueryClient();
  client.setQueryData(PICKER_KEY, []);
  client.setQueryData(DETAIL_KEY, { id: "p1" });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
});

const removal = { removalReason: "sold_elsewhere" };

describe("listing status changes mark the trade picker and the detail stale", () => {
  it.each([
    ["reactivate", () => lifecycle.handleReactivate()],
    ["send for review", () => lifecycle.handleActivate()],
    ["deactivate", () => lifecycle.handleDeactivate(removal)],
    ["delete", () => lifecycle.handleDelete(removal)],
  ])("%s", async (_name, run) => {
    expect(client.getQueryState(PICKER_KEY)?.isInvalidated).toBe(false);
    act(() => run());
    await waitFor(() =>
      expect(client.getQueryState(PICKER_KEY)?.isInvalidated).toBe(true),
    );
    expect(client.getQueryState(DETAIL_KEY)?.isInvalidated).toBe(true);
  });
});
