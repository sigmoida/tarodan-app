// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  signedIn: true,
  offers: vi.fn(),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: { isAuthenticated: boolean }) => unknown) =>
    select({ isAuthenticated: h.signedIn }),
}));
vi.mock("@/lib/api", () => ({ boostApi: { offers: h.offers } }));

import { useBoostEnabled } from "./useBoostOffers";

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const seen: boolean[] = [];

function render(enabled?: boolean) {
  function Harness() {
    seen.push(useBoostEnabled({ enabled }));
    return null;
  }
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
        <Harness />
      </QueryClientProvider>,
    ),
  );
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 3; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const last = () => seen[seen.length - 1];

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seen.length = 0;
  h.signedIn = true;
  h.offers.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
});

describe("useBoostEnabled", () => {
  it("reads the switch from one offers request shared by every caller", async () => {
    h.offers.mockResolvedValue({ data: { enabled: false, offers: [] } });
    render();
    // Until the answer: on, like the setting's own default.
    expect(seen[0]).toBe(true);
    await flush();

    expect(last()).toBe(false);
    expect(h.offers).toHaveBeenCalledTimes(1);
  });

  it("never asks for a guest", async () => {
    h.signedIn = false;
    render();
    await flush();

    expect(h.offers).not.toHaveBeenCalled();
  });

  it("does not ask when the caller does not need it", async () => {
    render(false);
    await flush();

    expect(h.offers).not.toHaveBeenCalled();
  });

  it("hides boost when the request fails", async () => {
    h.offers.mockRejectedValue(new Error("down"));
    render();
    await flush();

    expect(last()).toBe(false);
  });
});
