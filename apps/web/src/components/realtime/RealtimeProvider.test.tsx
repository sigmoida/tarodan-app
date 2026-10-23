// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/stores/authStore", () => ({
  useAuthStore: <T,>(select: (s: { token: string | null }) => T) =>
    select({ token: null }),
}));

import { RealtimeProvider } from "./RealtimeProvider";

describe("RealtimeProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  // It used to clear the whole cache on every mount (its token was always
  // null), which threw away the server-seeded queries of each page load.
  it("keeps the query cache on mount", () => {
    const client = new QueryClient();
    client.setQueryData(["listings", "list"], [{ id: "l1" }]);

    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <RealtimeProvider />
        </QueryClientProvider>,
      ),
    );

    expect(client.getQueryData(["listings", "list"])).toEqual([{ id: "l1" }]);
  });
});
