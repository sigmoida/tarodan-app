import { registerPdfFonts, resolvePdfFontPath } from "./pdf-fonts";

describe("pdf-fonts", () => {
  it("paketlenmiş DejaVu fontunu regular ve bold için çözer", () => {
    expect(resolvePdfFontPath("regular")).toMatch(/DejaVuSans\.ttf$/);
    expect(resolvePdfFontPath("bold")).toMatch(/DejaVuSans-Bold\.ttf$/);
  });

  it("fontu belgeye kaydeder ve body adlarını döner", () => {
    const registerFont = jest.fn();
    const names = registerPdfFonts({ registerFont });

    expect(names).toEqual({ regular: "body", bold: "body-bold" });
    expect(registerFont).toHaveBeenCalledTimes(2);
  });

  it("kayıt patlarsa Helvetica'ya düşer ve uyarı loglar", () => {
    const warn = jest.fn();
    const names = registerPdfFonts(
      {
        registerFont: () => {
          throw new Error("bozuk font");
        },
      },
      { logger: { warn } as never },
    );

    expect(names).toEqual({ regular: "Helvetica", bold: "Helvetica-Bold" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("bozuk font"));
  });
});
