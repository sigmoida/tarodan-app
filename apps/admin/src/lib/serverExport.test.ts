import { describe, expect, it } from "vitest";
import {
  exportFilename,
  exportSortParams,
  exportTruncatedAt,
} from "./serverExport";

describe("server export response", () => {
  it("uses the server's file name, with the caller's fallback", () => {
    expect(
      exportFilename(
        { "content-disposition": 'attachment; filename="onay-kayitlari.xlsx"' },
        "x.xlsx",
      ),
    ).toBe("onay-kayitlari.xlsx");
    expect(exportFilename(undefined, "x.xlsx")).toBe("x.xlsx");
  });

  it("reports the cap only when the file was truncated", () => {
    expect(exportTruncatedAt({ "x-export-truncated-at": "5000" })).toBe(5000);
    expect(exportTruncatedAt({ "x-export-truncated-at": "0" })).toBeNull();
    expect(exportTruncatedAt({})).toBeNull();
  });
});

describe("exportSortParams", () => {
  it("forwards the table sort only while one is active", () => {
    expect(
      exportSortParams({
        sortBy: "createdAt",
        sortOrder: "desc",
        sortType: "date",
      }),
    ).toEqual({ sortBy: "createdAt", sortOrder: "desc", sortType: "date" });
    expect(exportSortParams({ sortOrder: "asc" })).toEqual({});
  });
});
