// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * `?boost=<productId>` opens the boost dialog once for an own, active listing
 * and clears the parameter; foreign, unknown and non-active ids are ignored.
 */

const h = vi.hoisted(() => ({
  search: "boost=l1",
  listings: [] as Array<Record<string, unknown>>,
  isLoading: false,
  replace: vi.fn(),
  lastEnabled: undefined as boolean | undefined,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/profile/listings",
  useRouter: () => ({ replace: h.replace }),
}));
vi.mock("./useMyListings", () => ({
  useMyListings: (_filter: string, enabled: boolean) => {
    h.lastEnabled = enabled;
    return { listings: h.listings, isLoading: h.isLoading };
  },
}));

import { useBoostDeepLink } from "./useBoostDeepLink";

let container: HTMLDivElement;
let root: Root;
const open = vi.fn();

function Host({ ready = true }: { ready?: boolean }) {
  useBoostDeepLink(ready, open);
  return null;
}
const render = (ready = true) => act(() => root.render(<Host ready={ready} />));

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  h.search = "boost=l1";
  h.isLoading = false;
  h.listings = [
    {
      id: "l1",
      title: "Camaro",
      status: "active",
      boostedUntil: "2026-11-01T00:00:00Z",
    },
    { id: "l2", title: "Mustang", status: "inactive" },
  ];
  open.mockReset();
  h.replace.mockReset();
});

afterEach(() => act(() => root.unmount()));

describe("useBoostDeepLink", () => {
  it("opens the dialog for an own active listing and clears the parameter", async () => {
    await render();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({
      id: "l1",
      title: "Camaro",
      boostedUntil: "2026-11-01T00:00:00Z",
    });
    expect(h.replace).toHaveBeenCalledWith("/profile/listings", {
      scroll: false,
    });
  });

  it("keeps the other parameters when it clears its own", async () => {
    h.search = "status=pending&boost=l1";
    await render();
    expect(h.replace).toHaveBeenCalledWith("/profile/listings?status=pending", {
      scroll: false,
    });
  });

  it("opens once even when the page renders again", async () => {
    await render();
    await render();
    expect(open).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledTimes(1);
  });

  it("ignores a listing that is not the viewer's, but still clears the parameter", async () => {
    h.search = "boost=someone-elses";
    await render();
    expect(open).not.toHaveBeenCalled();
    expect(h.replace).toHaveBeenCalledTimes(1);
  });

  it("ignores an own listing that is not active", async () => {
    h.search = "boost=l2";
    await render();
    expect(open).not.toHaveBeenCalled();
  });

  it("waits while the listings load", async () => {
    h.isLoading = true;
    await render();
    expect(open).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
    h.isLoading = false;
    await render();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and loads nothing, without the parameter", async () => {
    h.search = "";
    await render();
    expect(h.lastEnabled).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("waits for the signed-in check", async () => {
    await render(false);
    expect(open).not.toHaveBeenCalled();
  });
});
