import { describe, expect, it } from "vitest";
import { heroClientSummaries, heroSwitchHiddenOn } from "./visibility";

const ON = { web: true, app: true };
const live = (
  platform: "web" | "app" | "all",
  isLive = true,
  hideOnIos = false,
) => ({ platform, isLive, hideOnIos });

/** Satırları `platform → [state, liveCount]` olarak sadeleştirir. */
const summarize = (...args: Parameters<typeof heroClientSummaries>) =>
  Object.fromEntries(
    heroClientSummaries(...args).map((r) => [
      r.platform,
      [r.state, r.liveCount],
    ]),
  );

describe("heroClientSummaries", () => {
  it("both switches on and `all` slides live → live everywhere with counts", () => {
    expect(summarize([live("all"), live("all")], ON)).toEqual({
      web: ["live", 2],
      app: ["live", 2],
    });
  });

  it("always returns one row per client, web first", () => {
    expect(heroClientSummaries([], ON).map((r) => r.platform)).toEqual([
      "web",
      "app",
    ]);
  });

  it("no slide at all → no live slide on both platforms", () => {
    expect(summarize([], ON)).toEqual({
      web: ["noLiveSlide", 0],
      app: ["noLiveSlide", 0],
    });
  });

  it("a platform-only slide counts for just that platform", () => {
    expect(summarize([live("web"), live("web"), live("all")], ON)).toEqual({
      web: ["live", 3],
      app: ["live", 1],
    });
    expect(summarize([live("app")], ON)).toEqual({
      web: ["noLiveSlide", 0],
      app: ["live", 1],
    });
  });

  it("scheduled / inactive slides do not count", () => {
    expect(summarize([live("all", false)], ON)).toEqual({
      web: ["noLiveSlide", 0],
      app: ["noLiveSlide", 0],
    });
  });

  it("a switched-off platform wins over its slides", () => {
    expect(summarize([live("all")], { web: false, app: true })).toEqual({
      web: ["switchOff", 0],
      app: ["live", 1],
    });
    // Staging: üç web slaytı, web kapalı, uygulama açık.
    expect(
      summarize([live("web"), live("web"), live("web")], {
        web: false,
        app: true,
      }),
    ).toEqual({ web: ["switchOff", 0], app: ["noLiveSlide", 0] });
  });

  it("app: every live app/all slide hidden in the native app → hiddenInApp", () => {
    expect(
      summarize([live("all", true, true), live("app", true, true)], ON),
    ).toEqual({ web: ["live", 1], app: ["hiddenInApp", 0] });
  });

  it("app: hidden-in-app slides are not counted; web ignores hideOnIos", () => {
    expect(summarize([live("all", true, true), live("app")], ON)).toEqual({
      web: ["live", 1],
      app: ["live", 1],
    });
    expect(summarize([live("web", true, true)], ON)).toEqual({
      web: ["live", 1],
      app: ["noLiveSlide", 0],
    });
  });
});

describe("heroSwitchHiddenOn", () => {
  it("lists the slide's target clients whose switch is off", () => {
    expect(heroSwitchHiddenOn(live("web"), { web: false, app: true })).toEqual([
      "web",
    ]);
    expect(heroSwitchHiddenOn(live("all"), { web: false, app: false })).toEqual(
      ["web", "app"],
    );
    expect(heroSwitchHiddenOn(live("app"), { web: false, app: true })).toEqual(
      [],
    );
    expect(heroSwitchHiddenOn(live("all"), ON)).toEqual([]);
  });

  it("ignores the app for a slide already hidden in the native app", () => {
    expect(
      heroSwitchHiddenOn(live("all", true, true), { web: true, app: false }),
    ).toEqual([]);
  });
});
