// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Advertisement } from "@/lib/api/advertisements";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  ads: [] as Advertisement[],
  cookieBannerOpen: false,
  enabledCalls: [] as boolean[],
}));

vi.mock("@/hooks/useActiveAds", () => ({
  useActiveAds: (_position: string, enabled: boolean) => {
    state.enabledCalls.push(enabled);
    return { ads: state.ads };
  },
}));
vi.mock("@/hooks/useCookieConsent", () => ({
  useCookieConsent: () => ({ needsConsent: state.cookieBannerOpen }),
}));

import { POPUP_AD_DELAY_MS, usePopupAd } from "./usePopupAd";
import { popupAdDismissKey } from "@/lib/ads/popupFrequency";
import { useBoostDialogStore } from "@/stores/boostDialogStore";
import { useRequiredStepsStore } from "@/stores/requiredStepsStore";

const ad = (over: Partial<Advertisement> = {}): Advertisement => ({
  id: "ad-1",
  title: "Popup",
  imageUrl: "https://cdn/p.png",
  linkUrl: null,
  hotspots: [],
  content: null,
  altText: null,
  width: 600,
  height: 600,
  position: "popup",
  platform: "web",
  popupFrequency: "until_dismissed",
  popupVersion: 1,
  campaign: null,
  ...over,
});

describe("usePopupAd", () => {
  let host: HTMLDivElement;
  let root: Root;
  let current: ReturnType<typeof usePopupAd>;

  function Harness() {
    current = usePopupAd();
    return null;
  }

  const mount = () =>
    act(() => {
      root.render(<Harness />);
    });

  const elapse = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    state.ads = [];
    state.cookieBannerOpen = false;
    state.enabledCalls = [];
    useRequiredStepsStore.setState({ outstanding: false });
    useBoostDialogStore.setState({ offerOpen: false, openDialogs: 0 });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it("3 sn sonra açılır; açılış kayıt yazmaz", () => {
    state.ads = [ad()];
    mount();
    expect(current.ad).toBeNull();
    elapse(POPUP_AD_DELAY_MS - 1);
    expect(current.ad).toBeNull();
    elapse(1);
    expect(current.ad?.id).toBe("ad-1");
    expect(window.localStorage.length).toBe(0);
  });

  it("kapatılmış reklam seçimden ÖNCE elenir: sıradaki gösterilir", () => {
    window.localStorage.setItem(popupAdDismissKey(ad({ id: "a" })), "1");
    state.ads = [ad({ id: "a" }), ad({ id: "b" })];
    mount();
    elapse(POPUP_AD_DELAY_MS);
    expect(current.ad?.id).toBe("b");
  });

  it("tek reklam kapatılmışsa hiç açılmaz", () => {
    window.localStorage.setItem(popupAdDismissKey(ad()), "1");
    state.ads = [ad()];
    mount();
    elapse(POPUP_AD_DELAY_MS * 2);
    expect(current.ad).toBeNull();
  });

  it("until_dismissed: kapatınca kayıt yazılır, yeniden girişte açılmaz", () => {
    state.ads = [ad()];
    mount();
    elapse(POPUP_AD_DELAY_MS);
    act(() => current.close());
    expect(current.ad).toBeNull();
    expect(window.localStorage.getItem(popupAdDismissKey(ad()))).not.toBeNull();

    // Ana sayfaya yeniden giriş = yeniden bağlanma.
    act(() => root.unmount());
    root = createRoot(host);
    mount();
    elapse(POPUP_AD_DELAY_MS * 2);
    expect(current.ad).toBeNull();
  });

  it("every_visit: kapatma kayıt yazmaz, yeniden girişte tekrar açılır", () => {
    state.ads = [ad({ popupFrequency: "every_visit" })];
    mount();
    elapse(POPUP_AD_DELAY_MS);
    act(() => current.close());
    expect(window.localStorage.length).toBe(0);

    act(() => root.unmount());
    root = createRoot(host);
    mount();
    elapse(POPUP_AD_DELAY_MS);
    expect(current.ad?.id).toBe("ad-1");
  });

  it("aynı bağlanmada kapatıldıktan sonra tekrar açılmaz ve istek kapanır", () => {
    state.ads = [ad({ popupFrequency: "every_visit" })];
    mount();
    elapse(POPUP_AD_DELAY_MS);
    act(() => current.close());
    elapse(POPUP_AD_DELAY_MS * 2);
    expect(current.ad).toBeNull();
    expect(state.enabledCalls.at(-1)).toBe(false);
  });

  it("başka katman açıkken açılmaz; kapanınca sayaç yeniden başlar", () => {
    state.ads = [ad()];
    act(() => useRequiredStepsStore.setState({ outstanding: true }));
    mount();
    elapse(POPUP_AD_DELAY_MS * 2);
    expect(current.ad).toBeNull();

    act(() => useRequiredStepsStore.setState({ outstanding: false }));
    elapse(POPUP_AD_DELAY_MS);
    expect(current.ad?.id).toBe("ad-1");
  });

  it("waits while the boost offer or a boost dialog is open", () => {
    state.ads = [ad()];
    act(() => useBoostDialogStore.setState({ offerOpen: true }));
    mount();
    elapse(POPUP_AD_DELAY_MS * 2);
    expect(current.ad).toBeNull();

    act(() =>
      useBoostDialogStore.setState({ offerOpen: false, openDialogs: 1 }),
    );
    elapse(POPUP_AD_DELAY_MS * 2);
    expect(current.ad).toBeNull();

    act(() => useBoostDialogStore.setState({ openDialogs: 0 }));
    elapse(POPUP_AD_DELAY_MS);
    expect(current.ad?.id).toBe("ad-1");
  });

  it("çerez bandı açıkken açılmaz", () => {
    state.ads = [ad()];
    state.cookieBannerOpen = true;
    mount();
    elapse(POPUP_AD_DELAY_MS * 2);
    expect(current.ad).toBeNull();
  });
});
