import { configureSharpSafety, isBlockedSharpMimeType } from "./sharp-safety";

describe("sharp safety", () => {
  it("blocks the vulnerable GIF, TIFF and VIPS loaders", () => {
    const sharp = { block: jest.fn() };

    expect(configureSharpSafety(sharp)).toBe(sharp);
    expect(sharp.block).toHaveBeenCalledWith({
      operation: [
        "VipsForeignLoadNsgif",
        "VipsForeignLoadTiff",
        "VipsForeignLoadVips",
      ],
    });
  });

  it.each(["image/gif", "image/tiff", "image/x-tiff"])(
    "rejects %s for image transformations",
    (mimeType) => {
      expect(isBlockedSharpMimeType(mimeType)).toBe(true);
    },
  );

  it("keeps supported static image formats enabled", () => {
    expect(isBlockedSharpMimeType("image/jpeg")).toBe(false);
    expect(isBlockedSharpMimeType("image/png")).toBe(false);
    expect(isBlockedSharpMimeType("image/webp")).toBe(false);
  });
});
