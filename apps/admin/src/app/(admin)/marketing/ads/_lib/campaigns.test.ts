import { describe, expect, it } from "vitest";
import {
  campaignLabel,
  selectableCampaigns,
  unwrapCampaigns,
} from "./campaigns";

const now = new Date("2026-07-15T12:00:00.000Z");
const c = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  isActive: true,
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-07-31T00:00:00.000Z",
  ...over,
});

describe("campaigns for the ad form", () => {
  it("unwraps a paginated or bare list", () => {
    expect(unwrapCampaigns([c("a")])).toHaveLength(1);
    expect(unwrapCampaigns({ data: [c("a"), c("b")] })).toHaveLength(2);
    expect(unwrapCampaigns(null)).toEqual([]);
  });

  it("keeps only active, not-yet-ended campaigns", () => {
    const list = [
      c("live"),
      c("upcoming", { startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-08-31T00:00:00.000Z" }),
      c("ended", { endDate: "2026-07-10T00:00:00.000Z" }),
      c("off", { isActive: false }),
    ];
    expect(selectableCampaigns(list, now).map((x) => x.id)).toEqual([
      "live",
      "upcoming",
    ]);
  });

  it("keeps the currently linked campaign even if it ended", () => {
    const list = [c("ended", { endDate: "2026-07-10T00:00:00.000Z" })];
    expect(selectableCampaigns(list, now, "ended")).toHaveLength(1);
  });

  it("labels with the Istanbul date range", () => {
    expect(campaignLabel(c("Yaz"))).toBe("Yaz (01.07.2026 – 31.07.2026)");
  });
});
