/** @format */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The order group fetch leaves a Sentry breadcrumb (`order.digital.fallback`,
 * ids only) when an order arrives without `kind`: digital-order gating then
 * runs on the `origin` fallback, and the breadcrumb makes a stale API
 * visible.
 */

const h = vi.hoisted(() => ({
  get: vi.fn(),
  info: vi.fn(),
  fetcher: null as null | ((id: string) => Promise<unknown>),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: { get: h.get } }));
vi.mock("@/lib/logger", () => ({ logger: { info: h.info } }));
vi.mock("@/hooks/useWebMutation", () => ({ useWebMutation: vi.fn() }));
vi.mock("@/hooks/useWebResource", () => ({
  useWebItem: (options: { fetcher: (id: string) => Promise<unknown> }) => {
    h.fetcher = options.fetcher;
    return {};
  },
  useWebList: vi.fn(),
}));

import { useOrderGroupQuery } from "./useOrderDetail";

/** Mounts the hook once so the mocked `useWebItem` captures its fetcher. */
function Probe() {
  useOrderGroupQuery("o1", true);
  return null;
}

const fetchGroup = async (orders: Array<Record<string, unknown>>) => {
  h.get.mockResolvedValueOnce({ data: { data: { orders } } });
  renderToStaticMarkup(createElement(Probe));
  return h.fetcher!("o1");
};

beforeEach(() => {
  h.get.mockReset();
  h.info.mockReset();
});

describe("useOrderGroupQuery", () => {
  it("leaves no breadcrumb when every order carries its kind", async () => {
    await fetchGroup([
      { id: "o1", kind: "boost" },
      { id: "o2", kind: "listing" },
    ]);
    expect(h.info).not.toHaveBeenCalled();
  });

  it("leaves the fallback breadcrumb with the order id when a kind is missing", async () => {
    await fetchGroup([{ id: "o1", origin: "platform_service" }]);
    expect(h.info).toHaveBeenCalledTimes(1);
    expect(h.info).toHaveBeenCalledWith("order.digital.fallback", {
      orderId: "o1",
    });
  });
});
