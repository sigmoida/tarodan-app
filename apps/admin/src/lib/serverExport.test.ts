import { describe, expect, it } from "vitest";
import {
  exportErrorMessage,
  exportFilename,
  exportNotice,
  exportRowCount,
  exportSortParams,
  exportTruncatedAt,
  readExportResponse,
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

  it("reads the row count, tolerating a missing or invalid header", () => {
    expect(exportRowCount({ "x-export-row-count": "42" })).toBe(42);
    expect(exportRowCount({ "x-export-row-count": "0" })).toBe(0);
    expect(exportRowCount({ "x-export-row-count": "abc" })).toBeNull();
    expect(exportRowCount({ "x-export-row-count": "" })).toBeNull();
    expect(exportRowCount({})).toBeNull();
    expect(exportRowCount(undefined)).toBeNull();
  });
});

describe("readExportResponse / exportNotice", () => {
  const data = new Uint8Array([1, 2, 3]);

  it("collects name, bytes, row count and cap from one response", () => {
    const file = readExportResponse(
      {
        data,
        headers: {
          "content-disposition": 'attachment; filename="iptaller.xlsx"',
          "x-export-row-count": "7",
        },
      },
      "fallback.xlsx",
    );
    expect(file).toEqual({
      filename: "iptaller.xlsx",
      data,
      rowCount: 7,
      truncatedAt: null,
    });
  });

  it("announces the row count on a complete file", () => {
    const file = readExportResponse(
      { data, headers: { "x-export-row-count": "7" } },
      "x.xlsx",
    );
    expect(exportNotice(file)).toEqual({ kind: "success", count: 7 });
  });

  it("announces a success without a count when the header is absent", () => {
    const file = readExportResponse({ data, headers: {} }, "x.xlsx");
    expect(exportNotice(file)).toEqual({ kind: "success", count: null });
  });

  it("warns with the cap, not the row count, on a truncated file", () => {
    const file = readExportResponse(
      {
        data,
        headers: { "x-export-truncated-at": "5000", "x-export-row-count": "5000" },
      },
      "x.xlsx",
    );
    expect(exportNotice(file)).toEqual({ kind: "truncated", count: 5000 });
  });
});

describe("exportErrorMessage", () => {
  const blobError = (body: unknown) => ({
    response: { data: new Blob([JSON.stringify(body)]) },
  });

  it("reads the server message out of a blob error body", async () => {
    await expect(
      exportErrorMessage(blobError({ message: "Dönem zorunlu" }), "fallback"),
    ).resolves.toBe("Dönem zorunlu");
  });

  it("falls back when the blob is not JSON", async () => {
    await expect(
      exportErrorMessage(
        { response: { data: new Blob(["<html>"]) } },
        "fallback",
      ),
    ).resolves.toBe("fallback");
  });

  it("reads a plain (non-blob) error body too", async () => {
    await expect(
      exportErrorMessage({ response: { data: { message: "Yetkisiz" } } }, "x"),
    ).resolves.toBe("Yetkisiz");
    await expect(exportErrorMessage(new Error("net"), "fallback")).resolves.toBe(
      "fallback",
    );
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
