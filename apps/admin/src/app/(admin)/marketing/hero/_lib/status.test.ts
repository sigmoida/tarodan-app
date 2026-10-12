import { describe, expect, it } from "vitest";
import { heroLiveStatus } from "./status";

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
