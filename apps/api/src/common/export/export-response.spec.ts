import { StreamableFile } from "@nestjs/common";

import {
  XLSX_CONTENT_TYPE,
  contentDisposition,
  sendExport,
} from "./export-response";

function res() {
  const headers = new Map<string, string>();
  return {
    headers,
    setHeader: jest.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
  };
}

const file = {
  filename: "onay-kayitlari-2026-10-12.xlsx",
  body: Buffer.from("xlsx"),
  rowCount: 42,
  truncatedAt: null,
};

describe("sendExport", () => {
  it("dosyayı önbelleğe alınmayan Excel eki olarak döner", () => {
    const response = res();
    const result = sendExport(response as never, file);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(Object.fromEntries(response.headers)).toEqual({
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": 'attachment; filename="onay-kayitlari-2026-10-12.xlsx"',
      "Cache-Control": "no-store",
      "X-Export-Row-Count": "42",
    });
    expect(result.getHeaders()).toMatchObject({
      type: XLSX_CONTENT_TYPE,
      length: 4,
    });
  });

  it("kırpılma başlığını YALNIZ tavan aşıldığında yazar", () => {
    const response = res();
    sendExport(response as never, { ...file, rowCount: 20000, truncatedAt: 20000 });
    expect(response.headers.get("X-Export-Truncated-At")).toBe("20000");
    expect(response.headers.get("X-Export-Row-Count")).toBe("20000");
  });
});

describe("contentDisposition", () => {
  it("ASCII adı düz yazar", () => {
    expect(contentDisposition("iptaller-2026-10-12.xlsx")).toBe(
      'attachment; filename="iptaller-2026-10-12.xlsx"',
    );
  });

  it("Türkçe karakterli ad için RFC 5987 filename* ekler", () => {
    expect(contentDisposition("özet-ğ.xlsx")).toBe(
      `attachment; filename="ozet-g.xlsx"; filename*=UTF-8''${encodeURIComponent("özet-ğ.xlsx")}`,
    );
  });
});
