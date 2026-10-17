import { describe, expect, it } from "vitest";
import { heroLiveStatus, heroRowStatus } from "./status";

const now = new Date("2026-07-15T12:00:00.000Z");
const slide = (p: Record<string, unknown>) => ({
  isActive: true,
  isLive: false,
  startDate: null,
  endDate: null,
  ...p,
});

describe("heroLiveStatus", () => {
  it("trusts the server isLive", () => {
    expect(heroLiveStatus(slide({ isLive: true }), now)).toBe("live");
  });

  it("derives the reason when not live", () => {
    expect(heroLiveStatus(slide({ isActive: false }), now)).toBe("inactive");
    expect(
      heroLiveStatus(slide({ endDate: "2026-07-01T00:00:00Z" }), now),
    ).toBe("expired");
    expect(
      heroLiveStatus(slide({ startDate: "2026-08-01T00:00:00Z" }), now),
    ).toBe("scheduled");
  });

  it("never shows live when the server says not live", () => {
    expect(heroLiveStatus(slide({}), now)).toBe("scheduled");
  });
});

describe("heroRowStatus", () => {
  const row = (p: Record<string, unknown>) =>
    slide({
      platform: "all",
      hideOnIos: false,
      cta1Href: null,
      cta2Href: null,
      ...p,
    }) as Parameters<typeof heroRowStatus>[0];
  const ON = { web: true, app: true };

  it("keeps heroLiveStatus semantics without visibility (other tabs)", () => {
    expect(heroRowStatus(row({ isLive: true }), now)).toEqual({
      status: "live",
      hiddenOn: null,
      variant: "success",
    });
    expect(heroRowStatus(row({ isActive: false }), now)).toMatchObject({
      status: "inactive",
      hiddenOn: null,
      variant: "outline",
    });
  });

  it("live + every switch on → plain live", () => {
    expect(heroRowStatus(row({ isLive: true }), now, ON)).toMatchObject({
      status: "live",
      hiddenOn: null,
      variant: "success",
    });
  });

  it("live but its platform switch is off → hidden on that platform, warning tone", () => {
    expect(
      heroRowStatus(row({ isLive: true, platform: "web" }), now, {
        web: false,
        app: true,
      }),
    ).toEqual({ status: "live", hiddenOn: "web", variant: "warning" });
    expect(
      heroRowStatus(row({ isLive: true }), now, { web: true, app: false }),
    ).toMatchObject({ hiddenOn: "app", variant: "warning" });
    expect(
      heroRowStatus(row({ isLive: true }), now, { web: false, app: false }),
    ).toMatchObject({ hiddenOn: "all", variant: "warning" });
  });

  it("a switch for another platform does not affect the slide", () => {
    expect(
      heroRowStatus(row({ isLive: true, platform: "app" }), now, {
        web: false,
        app: true,
      }),
    ).toMatchObject({ hiddenOn: null, variant: "success" });
  });

  it("not-live slides never get the hidden suffix", () => {
    expect(
      heroRowStatus(row({ startDate: "2026-08-01T00:00:00Z" }), now, {
        web: false,
        app: false,
      }),
    ).toEqual({ status: "scheduled", hiddenOn: null, variant: "outline" });
  });

  it("store-only slide reads as hidden in the app, matching the card", () => {
    expect(
      heroRowStatus(
        row({
          isLive: true,
          cta1Href: "https://apps.apple.com/tr/app/id6786614139",
        }),
        now,
        ON,
      ),
    ).toEqual({ status: "live", hiddenOn: "app", variant: "warning" });
  });
});
