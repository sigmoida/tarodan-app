/** @format */

import { describe, expect, it } from "vitest";
import { createUrlWriteTracker, normalizeParams } from "./urlSync";

const sp = (query: string) => new URLSearchParams(query);

describe("normalizeParams", () => {
  it("ignores parameter order", () => {
    expect(normalizeParams(sp("b=2&a=1"))).toBe(normalizeParams(sp("a=1&b=2")));
  });
});

describe("createUrlWriteTracker", () => {
  it("adopts URL changes that did not come from our own writes", () => {
    const tracker = createUrlWriteTracker();
    expect(tracker.isOwnWrite(sp("color=red"))).toBe(false);
  });

  it("skips an older own write landing after a newer selection (red then black)", () => {
    const tracker = createUrlWriteTracker();
    tracker.recordWrite(sp("color=red"));
    tracker.recordWrite(sp("color=red,black"));
    // the first replace lands while state is already [red, black]
    expect(tracker.isOwnWrite(sp("color=red"))).toBe(true);
    expect(tracker.isOwnWrite(sp("color=red,black"))).toBe(true);
  });

  it("matches own writes regardless of parameter order", () => {
    const tracker = createUrlWriteTracker();
    tracker.recordWrite(sp("scale=1%3A18&sortBy=price_asc"));
    expect(tracker.isOwnWrite(sp("sortBy=price_asc&scale=1%3A18"))).toBe(true);
  });

  it("drops superseded writes when a newer one lands first", () => {
    const tracker = createUrlWriteTracker();
    tracker.recordWrite(sp("color=red"));
    tracker.recordWrite(sp("color=red,black"));
    expect(tracker.isOwnWrite(sp("color=red,black"))).toBe(true);
    // a later back-navigation to the older URL is external, not ours
    expect(tracker.isOwnWrite(sp("color=red"))).toBe(false);
  });

  it("forgets pending writes once an external navigation lands", () => {
    const tracker = createUrlWriteTracker();
    tracker.recordWrite(sp("color=red"));
    expect(tracker.isOwnWrite(sp(""))).toBe(false);
    expect(tracker.isOwnWrite(sp("color=red"))).toBe(false);
  });

  it("is consumed once: the same URL arriving again later is external", () => {
    const tracker = createUrlWriteTracker();
    tracker.recordWrite(sp("tradeOnly=true"));
    expect(tracker.isOwnWrite(sp("tradeOnly=true"))).toBe(true);
    expect(tracker.isOwnWrite(sp("tradeOnly=true"))).toBe(false);
  });
});
