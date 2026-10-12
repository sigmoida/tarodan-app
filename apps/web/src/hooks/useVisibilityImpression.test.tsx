// @vitest-environment jsdom
/** @format */

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IMPRESSION_VISIBLE_MS,
  useVisibilityImpression,
} from "./useVisibilityImpression";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type IoCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;

let ioCallback: IoCallback | null = null;
const disconnect = vi.fn();

class FakeIntersectionObserver {
  constructor(cb: IoCallback) {
    ioCallback = cb;
  }
  observe() {}
  disconnect = disconnect;
}

function Probe({ onSeen }: { onSeen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useVisibilityImpression(ref, onSeen);
  return <div ref={ref} />;
}

describe("useVisibilityImpression", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    ioCallback = null;
    disconnect.mockClear();
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const see = (ratio: number) =>
    act(() => {
      ioCallback?.([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);
    });

  it("%50 görünürlük 1 sn sürerse bir kez çağırır", () => {
    const onSeen = vi.fn();
    act(() => root.render(<Probe onSeen={onSeen} />));

    see(0.6);
    act(() => vi.advanceTimersByTime(IMPRESSION_VISIBLE_MS - 1));
    expect(onSeen).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSeen).toHaveBeenCalledTimes(1);

    // Tekrar görünse de aynı yaşam döngüsünde yeniden sayılmaz.
    see(1);
    act(() => vi.advanceTimersByTime(IMPRESSION_VISIBLE_MS * 2));
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it("süre dolmadan görünürlük kaybolursa saymaz", () => {
    const onSeen = vi.fn();
    act(() => root.render(<Probe onSeen={onSeen} />));

    see(0.8);
    act(() => vi.advanceTimersByTime(500));
    see(0.1);
    act(() => vi.advanceTimersByTime(IMPRESSION_VISIBLE_MS * 2));
    expect(onSeen).not.toHaveBeenCalled();
  });

  it("%50'nin altındaki görünürlükte saymaz", () => {
    const onSeen = vi.fn();
    act(() => root.render(<Probe onSeen={onSeen} />));

    see(0.4);
    act(() => vi.advanceTimersByTime(IMPRESSION_VISIBLE_MS * 2));
    expect(onSeen).not.toHaveBeenCalled();
  });

  it("IntersectionObserver yoksa yalnız süre bekler", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const onSeen = vi.fn();
    act(() => root.render(<Probe onSeen={onSeen} />));

    act(() => vi.advanceTimersByTime(IMPRESSION_VISIBLE_MS));
    expect(onSeen).toHaveBeenCalledTimes(1);
  });
});
