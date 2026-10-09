import { describe, expect, it } from "vitest";
import { adLiveStatus } from "./status";

const now = new Date("2026-07-15T12:00:00.000Z");
const base = {
  isActive: true,
  startDate: null,
  endDate: null,
  discount: null,
};

describe("adLiveStatus", () => {
  it("is live without a schedule", () => {
    expect(adLiveStatus(base, now)).toBe("live");
  });

  it("is inactive when switched off, whatever the dates say", () => {
    expect(adLiveStatus({ ...base, isActive: false }, now)).toBe("inactive");
  });

  it("is scheduled before the start date", () => {
    expect(
      adLiveStatus({ ...base, startDate: "2026-07-20T00:00:00.000Z" }, now),
    ).toBe("scheduled");
  });

  it("is expired after the end date", () => {
    expect(
      adLiveStatus({ ...base, endDate: "2026-07-10T00:00:00.000Z" }, now),
    ).toBe("expired");
  });

  it("is live inside the window", () => {
    expect(
      adLiveStatus(
        {
          ...base,
          startDate: "2026-07-01T00:00:00.000Z",
          endDate: "2026-07-31T00:00:00.000Z",
        },
        now,
      ),
    ).toBe("live");
  });

  it("reports campaign ended when the linked campaign is off or past", () => {
    const campaign = {
      id: "d1",
      name: "x",
      isActive: true,
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-31T00:00:00.000Z",
    };
    expect(adLiveStatus({ ...base, discount: campaign }, now)).toBe("live");
    expect(
      adLiveStatus(
        { ...base, discount: { ...campaign, isActive: false } },
        now,
      ),
    ).toBe("campaignEnded");
    expect(
      adLiveStatus(
        { ...base, discount: { ...campaign, endDate: "2026-07-10T00:00:00.000Z" } },
        now,
      ),
    ).toBe("campaignEnded");
  });

  it("prefers inactive over every other state", () => {
    expect(
      adLiveStatus(
        {
          isActive: false,
          startDate: null,
          endDate: "2026-07-10T00:00:00.000Z",
          discount: null,
        },
        now,
      ),
    ).toBe("inactive");
  });
});
