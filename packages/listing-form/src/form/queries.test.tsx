// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListingFormApiProvider, type ListingFormApi } from "./api-context";
import { useCommissionPreview } from "./queries";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function Harness({ price }: { price: string | number }) {
  useCommissionPreview(price, "category-1", "small");
  return null;
}

async function previewFor(price: string | number) {
  const get = vi.fn(async () => ({ sellerNetAmount: 900 }));
  const api: ListingFormApi = {
    get: get as ListingFormApi["get"],
    uploadProductImage: async () => {
      throw new Error("not used");
    },
    rotateProductImage: async () => {
      throw new Error("not used");
    },
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(
      <QueryClientProvider client={client}>
        <ListingFormApiProvider api={api}>
          <Harness price={price} />
        </ListingFormApiProvider>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return get;
}

describe("useCommissionPreview", () => {
  it.each([
    ["1250,50", 1250.5],
    ["1250.50", 1250.5],
    ["1000", 1000],
    [999.9, 999.9],
  ])(
    "asks for the parsed amount of %j, never the typed text",
    async (price, amount) => {
      const get = await previewFor(price);
      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith("/orders/commission-preview", {
        amount,
        categoryId: "category-1",
        packageTier: "small",
      });
    },
  );

  it.each(["1.000", "abc", "", "0", 0])(
    "asks nothing for %j (refused, empty or zero)",
    async (price) => {
      // "1.000" read as 1 would show the seller the fee of a 1 TL listing.
      const get = await previewFor(price);
      expect(get).not.toHaveBeenCalled();
    },
  );
});
