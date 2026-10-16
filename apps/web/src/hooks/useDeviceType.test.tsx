// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_MEDIA_QUERY, useDeviceType } from "./useDeviceType";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = () => void;

function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: initialMatches,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  const matchMedia = vi.fn().mockReturnValue(query);
  vi.stubGlobal("matchMedia", matchMedia);
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia;
  return {
    matchMedia,
    listeners,
    setMatches: (matches: boolean) => {
      query.matches = matches;
      listeners.forEach((fn) => fn());
    },
  };
}

describe("useDeviceType", () => {
  let container: HTMLDivElement;
  let root: Root;
  const seen: Array<string | null> = [];

  function Probe() {
    seen.push(useDeviceType());
    return null;
  }

  beforeEach(() => {
    seen.length = 0;
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it("ilk çizimde bilinmiyor (null), ölçümden sonra cihazı verir", () => {
    const mq = stubMatchMedia(false);
    act(() => root.render(<Probe />));

    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toBe("desktop");
    expect(mq.matchMedia).toHaveBeenCalledWith(MOBILE_MEDIA_QUERY);
  });

  it("dar ekranda mobil verir ve değişimi dinler", () => {
    const mq = stubMatchMedia(true);
    act(() => root.render(<Probe />));
    expect(seen[seen.length - 1]).toBe("mobile");

    act(() => mq.setMatches(false));
    expect(seen[seen.length - 1]).toBe("desktop");
  });

  it("söküldüğünde dinleyiciyi bırakır", () => {
    const mq = stubMatchMedia(false);
    act(() => root.render(<Probe />));
    expect(mq.listeners.size).toBe(1);

    act(() => root.unmount());
    expect(mq.listeners.size).toBe(0);
    root = createRoot(container);
  });
});
