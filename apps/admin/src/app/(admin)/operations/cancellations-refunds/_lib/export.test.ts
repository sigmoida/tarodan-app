import { describe, expect, it } from "vitest";
import { exportFilename, exportParams, isTruncated } from "./export";

describe("exportParams", () => {
  it("sends the tab, sub-tab and filters of the screen", () => {
    expect(
      exportParams({
        tab: "offer",
        bucket: "platform",
        filters: { party: "K01", startDate: "2026-09-01" },
        sort: {},
      }),
    ).toEqual({
      party: "K01",
      startDate: "2026-09-01",
      tab: "offer",
      bucket: "platform",
    });
  });

  it("forwards the direction only while the table is sorted", () => {
    expect(
      exportParams({
        tab: "all",
        bucket: "all",
        filters: {},
        sort: { sortBy: "cancelledAt", sortOrder: "asc" },
      }),
    ).toMatchObject({ sortOrder: "asc" });
    expect(
      exportParams({ tab: "all", bucket: "all", filters: {}, sort: {} }),
    ).not.toHaveProperty("sortOrder");
  });
});

describe("export response headers", () => {
  it("uses the server's file name, with a fallback", () => {
    expect(
      exportFilename({
        "content-disposition":
          'attachment; filename="iptaller-2026-09-22.xlsx"',
      }),
    ).toBe("iptaller-2026-09-22.xlsx");
    expect(exportFilename(undefined)).toBe("iptaller.xlsx");
  });

  it("reports the cap only when the file was truncated", () => {
    expect(isTruncated({ "x-export-truncated-at": "5000" })).toBe(5000);
    expect(isTruncated({ "x-export-truncated-at": "0" })).toBeNull();
    expect(isTruncated({})).toBeNull();
  });
});
