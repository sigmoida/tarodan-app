// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const getActive = vi.fn();
let visible = true;

vi.mock("@/lib/api/advertisements", () => ({
  advertisementsApi: { getActive: (...args: unknown[]) => getActive(...args) },
}));
vi.mock("./useBannerVisibility", () => ({
  useBannerVisibility: () => visible,
}));
vi.mock("./useDeviceType", () => ({ useDeviceType: () => "desktop" }));

import { useActiveAds } from "./useActiveAds";
import type { AdPosition } from "@/lib/api/advertisements";

const AD = { id: "ad-1", hotspots: [] };

/**
 * Reklamsız üye için TÜM yuvalar (banner, satır arası, üst şerit, popup) aynı
 * kapıdan geçer: `useActiveAds`. Eskiden yalnız header/footer yuvası uyuyordu.
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
    // Sorgunun çözülmesi için bir tur daha.
    await act(async () => {});
  }

  beforeEach(() => {
    getActive.mockReset();
    getActive.mockResolvedValue({ data: { data: [AD] } });
    visible = true;
    latest = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each(["header", "footer", "inline", "topbar", "popup"] as const)(
    "%s: görünürken afişleri getirir",
    async (position) => {
      await mount(position);
      expect(getActive).toHaveBeenCalledTimes(1);
      expect(latest?.ads).toHaveLength(1);
    },
  );

  it.each(["header", "footer", "inline", "topbar", "popup"] as const)(
    "%s: reklamsız üyede istek atılmaz ve afiş dönmez",
    async (position) => {
      visible = false;
      await mount(position);
      expect(getActive).not.toHaveBeenCalled();
      expect(latest?.ads).toEqual([]);
    },
  );
});
