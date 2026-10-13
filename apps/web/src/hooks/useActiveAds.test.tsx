// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BannerVisibility } from "@/lib/ads/adVisibility";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const getActive = vi.fn();
let visibility: BannerVisibility = "visible";

vi.mock("@/lib/api/advertisements", () => ({
  advertisementsApi: { getActive: (...args: unknown[]) => getActive(...args) },
}));
vi.mock("./useBannerVisibility", () => ({
  useBannerVisibility: () => visibility,
}));
vi.mock("./useDeviceType", () => ({ useDeviceType: () => "desktop" }));

import { useActiveAds } from "./useActiveAds";
import type { AdPosition } from "@/lib/api/advertisements";

const AD = { id: "ad-1", hotspots: [] };
const POSITIONS = ["header", "footer", "inline", "topbar", "popup"] as const;

/**
 * Reklamsız üye için TÜM yuvalar (banner, satır arası, üst şerit, popup) aynı
 * kapıdan geçer: `useActiveAds`. Afişler oturum / limit sorgusunu beklemez.
 */
describe("useActiveAds — reklamsızlık tüm yuvalar için", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useActiveAds> | null;

  function Probe({ position }: { position: AdPosition }) {
    latest = useActiveAds(position);
    return null;
  }

  async function mount(position: AdPosition) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe position={position} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {});
  }

  beforeEach(() => {
    getActive.mockReset();
    getActive.mockResolvedValue({ data: { data: [AD] } });
    visibility = "visible";
    latest = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each(POSITIONS)("%s: görünürken afişleri getirir", async (position) => {
    await mount(position);
    expect(getActive).toHaveBeenCalledTimes(1);
    expect(latest?.ads).toHaveLength(1);
    expect(latest?.reserved).toBe(false);
  });

  it.each(POSITIONS)(
    "%s: reklamsız üyede istek atılmaz ve afiş dönmez",
    async (position) => {
      visibility = "hidden";
      await mount(position);
      expect(getActive).not.toHaveBeenCalled();
      expect(latest?.ads).toEqual([]);
      expect(latest?.reserved).toBe(false);
    },
  );

  it.each(POSITIONS)(
    "%s: katman bilinmezken afişler PARALEL çekilir ama çizilmez; yuva ölçüsü ayrılır",
    async (position) => {
      visibility = "pending";
      await mount(position);
      // Auth + limits zincirini beklemez: istek hemen atıldı.
      expect(getActive).toHaveBeenCalledTimes(1);
      expect(latest?.ads).toEqual([]);
      expect(latest?.reserved).toBe(true);
    },
  );

  it("katman bilinmezken afiş yoksa yer ayrılmaz", async () => {
    visibility = "pending";
    getActive.mockResolvedValue({ data: { data: [] } });
    await mount("topbar");
    expect(latest?.reserved).toBe(false);
  });

  it("pending → visible geçişinde afişler yeniden istenmeden görünür", async () => {
    visibility = "pending";
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const render = () =>
      act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <Probe position="header" />
          </QueryClientProvider>,
        );
      });
    await render();
    await act(async () => {});
    expect(latest?.ads).toEqual([]);

    visibility = "visible";
    await render();
    await act(async () => {});
    expect(latest?.ads).toHaveLength(1);
    expect(getActive).toHaveBeenCalledTimes(1);
  });
});
