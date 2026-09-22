import { resolveProductImageUrl } from "./product-image-url";

describe("resolveProductImageUrl", () => {
  const publicUrl = (key: string) => `https://cdn.example/${key}`;

  it("returns null for an empty value", () => {
    expect(resolveProductImageUrl(null, publicUrl)).toBeNull();
    expect(resolveProductImageUrl("", publicUrl)).toBeNull();
  });

  it("strips expired presigned parameters from an S3 URL", () => {
    expect(
      resolveProductImageUrl(
        "https://bucket.s3/img.jpg?X-Amz-Signature=abc&X-Amz-Expires=60",
        publicUrl,
      ),
    ).toBe("https://bucket.s3/img.jpg");
  });

  it("keeps plain URLs and root-relative paths as they are", () => {
    expect(resolveProductImageUrl("https://x/y.jpg", publicUrl)).toBe(
      "https://x/y.jpg",
    );
    expect(resolveProductImageUrl("/static/y.jpg", publicUrl)).toBe(
      "/static/y.jpg",
    );
  });

  it("resolves a storage key through the storage service, null without one", () => {
    expect(resolveProductImageUrl("product-images/a.jpg", publicUrl)).toBe(
      "https://cdn.example/product-images/a.jpg",
    );
    expect(resolveProductImageUrl("product-images/a.jpg")).toBeNull();
  });
});
