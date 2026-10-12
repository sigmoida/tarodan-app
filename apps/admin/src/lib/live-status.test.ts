import { describe, expect, it } from "vitest";
import { scheduleLiveStatus } from "./live-status";

const now = new Date("2026-07-15T12:00:00.000Z");
const base = { isActive: true, startDate: null, endDate: null };

describe("scheduleLiveStatus", () => {
  it("is live without a window", () => {
    expect(scheduleLiveStatus(base, now)).toBe("live");
  });
  it("inactive wins over everything", () => {
    expect(
      scheduleLiveStatus(
        { ...base, isActive: false, endDate: "2026-01-01T00:00:00Z" },
        now,
      ),
    ).toBe("inactive");
  });
  it("is scheduled before the start", () => {
    expect(
      scheduleLiveStatus({ ...base, startDate: "2026-08-01T00:00:00Z" }, now),
    ).toBe("scheduled");
  });
  it("is expired after the end", () => {
    expect(
      scheduleLiveStatus({ ...base, endDate: "2026-07-01T00:00:00Z" }, now),
    ).toBe("expired");
  });
  it("is live inside the window", () => {
    expect(
      scheduleLiveStatus(
        {
          ...base,
          startDate: "2026-07-01T00:00:00Z",
          endDate: "2026-07-31T00:00:00Z",
        },
        now,
      ),
    ).toBe("live");
  });
});
