import { isSafePublicObjectKey, StorageService } from "./storage.service";

/**
 * `ownPublicAssetKey` decides which URLs a client may store as one of our
 * images and which URLs the server may fetch (collection covers). Anything it
 * accepts is rebuilt from the key with `getPublicAssetUrl`, so it must accept
 * only our own roots followed by a safe public object key.
 */
describe("StorageService.ownPublicAssetKey", () => {
  const S3_ROOT = "https://amzn-tarodan.s3.eu-west-1.amazonaws.com";
  const KEY = "prod/collections/user/u1/0f8b7c1e.webp";

  const makeService = (env: Record<string, string | undefined>) => {
    const values: Record<string, string | undefined> = {
      NODE_ENV: "production",
      S3_BUCKET: "amzn-tarodan",
      AWS_REGION: "eu-west-1",
      ...env,
    };
    const config = {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    };
    return new StorageService(config as never, {} as never);
  };

  describe("accepted: our own roots", () => {
    it("the public base in the virtual-hosted S3 form (the stored production form)", () => {
      const svc = makeService({ S3_PUBLIC_BASE_URL: S3_ROOT });
      expect(svc.ownPublicAssetKey(`${S3_ROOT}/${KEY}`)).toBe(KEY);
      expect(svc.getPublicAssetUrl(KEY)).toBe(`${S3_ROOT}/${KEY}`);
    });

    it("the public base with a trailing slash", () => {
      const svc = makeService({ S3_PUBLIC_BASE_URL: `${S3_ROOT}/` });
      expect(svc.ownPublicAssetKey(`${S3_ROOT}/${KEY}`)).toBe(KEY);
    });

    it("a path-style public base (base carries the bucket in its path)", () => {
      const base = "https://s3.eu-west-1.amazonaws.com/amzn-tarodan";
      const svc = makeService({ S3_PUBLIC_BASE_URL: base });
      expect(svc.ownPublicAssetKey(`${base}/${KEY}`)).toBe(KEY);
    });

    it("with a CDN base, the bucket's virtual-hosted and path-style S3 URLs still resolve", () => {
      const svc = makeService({
        S3_PUBLIC_BASE_URL: "https://cdn.example.com",
      });
      expect(svc.ownPublicAssetKey(`https://cdn.example.com/${KEY}`)).toBe(KEY);
      expect(svc.ownPublicAssetKey(`${S3_ROOT}/${KEY}`)).toBe(KEY);
      expect(
        svc.ownPublicAssetKey(
          `https://s3.eu-west-1.amazonaws.com/amzn-tarodan/${KEY}`,
        ),
      ).toBe(KEY);
    });

    it("a custom S3_ENDPOINT (MinIO) in the path-style form the client uses", () => {
      const svc = makeService({
        S3_PUBLIC_BASE_URL: "http://localhost:9000/amzn-tarodan",
        S3_ENDPOINT: "http://minio:9000",
      });
      expect(
        svc.ownPublicAssetKey(`http://localhost:9000/amzn-tarodan/${KEY}`),
      ).toBe(KEY);
      expect(
        svc.ownPublicAssetKey(`http://minio:9000/amzn-tarodan/${KEY}`),
      ).toBe(KEY);
      // With a custom endpoint, AWS addresses are not ours.
      expect(svc.ownPublicAssetKey(`${S3_ROOT}/${KEY}`)).toBeNull();
    });

    it("a URL under a nested root when the outer root also prefix-matches", () => {
      const svc = makeService({
        S3_PUBLIC_BASE_URL: "https://storage.example.com",
        S3_ENDPOINT: "https://storage.example.com",
      });
      expect(
        svc.ownPublicAssetKey(
          `https://storage.example.com/amzn-tarodan/${KEY}`,
        ),
      ).toBe(KEY);
      expect(svc.ownPublicAssetKey(`https://storage.example.com/${KEY}`)).toBe(
        KEY,
      );
    });

    it("every public bucket root", () => {
      const svc = makeService({ S3_PUBLIC_BASE_URL: S3_ROOT });
      for (const root of [
        "products",
        "collections",
        "avatars",
        "reviews",
        "brands",
      ]) {
        expect(svc.ownPublicAssetKey(`${S3_ROOT}/prod/${root}/a/b.webp`)).toBe(
          `prod/${root}/a/b.webp`,
        );
      }
    });
  });

  describe("refused", () => {
    const svc = makeService({ S3_PUBLIC_BASE_URL: S3_ROOT });

    it.each([
      ["another host", `https://evil.example.com/${KEY}`],
      [
        "a host that only starts like ours",
        `https://amzn-tarodan.s3.eu-west-1.amazonaws.com.evil.com/${KEY}`,
      ],
      [
        "another bucket on S3",
        `https://other-bucket.s3.eu-west-1.amazonaws.com/${KEY}`,
      ],
      [
        "another region",
        `https://amzn-tarodan.s3.us-east-1.amazonaws.com/${KEY}`,
      ],
      [
        "the legacy global S3 host",
        `https://amzn-tarodan.s3.amazonaws.com/${KEY}`,
      ],
      [
        "http when the base is https",
        `http://amzn-tarodan.s3.eu-west-1.amazonaws.com/${KEY}`,
      ],
      [
        "an explicit port",
        `https://amzn-tarodan.s3.eu-west-1.amazonaws.com:443/${KEY}`,
      ],
      [
        "an upper-case host",
        `https://AMZN-TARODAN.s3.eu-west-1.amazonaws.com/${KEY}`,
      ],
      [
        "the cloud metadata address",
        "http://169.254.169.254/latest/meta-data/iam",
      ],
      ["a loopback IP", `http://127.0.0.1/${KEY}`],
      ["an IPv6 loopback", `http://[::1]/${KEY}`],
      ["localhost", `http://localhost/${KEY}`],
      [
        "credentials before our host",
        `https://user:pass@amzn-tarodan.s3.eu-west-1.amazonaws.com/${KEY}`,
      ],
      [
        "our host as credentials of another",
        `https://amzn-tarodan.s3.eu-west-1.amazonaws.com@evil.com/${KEY}`,
      ],
      ["an @ in the path", `${S3_ROOT}/@evil.com/${KEY}`],
      [
        "a percent-encoded dot segment",
        `${S3_ROOT}/prod/collections/%2e%2e/documents/x.pdf`,
      ],
      ["an encoded slash", `${S3_ROOT}/prod/collections/user%2Fu1/a.webp`],
      [
        "a dot-dot segment",
        `${S3_ROOT}/prod/collections/../documents/invoice.pdf`,
      ],
      ["a dot segment", `${S3_ROOT}/prod/collections/./a.webp`],
      ["an empty segment", `${S3_ROOT}/prod/collections//a.webp`],
      [
        "a leading double slash (protocol-relative path)",
        `${S3_ROOT}//evil.com/${KEY}`,
      ],
      ["a backslash", `${S3_ROOT}/prod/collections\\..\\documents\\x.pdf`],
      ["a query string (presigned)", `${S3_ROOT}/${KEY}?X-Amz-Signature=abc`],
      ["a fragment", `${S3_ROOT}/${KEY}#x`],
      ["a tab", `${S3_ROOT}/prod/collections/a\t.webp`],
      ["a newline", `${S3_ROOT}/prod/collections/a\n.webp`],
      ["a non-ASCII character", `${S3_ROOT}/prod/collections/aı.webp`],
      ["a private bucket (messages)", `${S3_ROOT}/prod/messages/u1/a.webp`],
      ["a private bucket (documents)", `${S3_ROOT}/prod/documents/invoice.pdf`],
      ["the bucket root only", `${S3_ROOT}/prod/collections/`],
      ["the root only", `${S3_ROOT}/`],
      ["a bare key", KEY],
      ["a non-URL", "not a url"],
      ["an empty string", ""],
      ["a javascript: URL", "javascript:alert(1)"],
      ["a data: URL", "data:image/png;base64,AAAA"],
      ["a file: URL", "file:///etc/passwd"],
      [
        "an over-long URL",
        `${S3_ROOT}/prod/collections/${"a".repeat(2100)}.webp`,
      ],
    ])("%s", (_label, url) => {
      expect(svc.ownPublicAssetKey(url)).toBeNull();
    });

    it("a non-string value", () => {
      expect(svc.ownPublicAssetKey(42 as unknown as string)).toBeNull();
    });

    it("everything while the public base is not configured", () => {
      expect(
        makeService({ S3_PUBLIC_BASE_URL: "" }).ownPublicAssetKey(
          `${S3_ROOT}/${KEY}`,
        ),
      ).toBeNull();
    });
  });

  describe("objectKeyPrefix", () => {
    it("matches the layout uploads are written to", () => {
      const svc = makeService({ S3_PUBLIC_BASE_URL: S3_ROOT });
      expect(svc.objectKeyPrefix("collections", "user/u1")).toBe(
        "prod/collections/user/u1/",
      );
      expect(svc.objectKeyPrefix("products")).toBe("prod/products/");
    });

    it("uses S3_ENV_PREFIX when set", () => {
      const svc = makeService({ S3_ENV_PREFIX: "staging" });
      expect(svc.objectKeyPrefix("collections", "user/u1")).toBe(
        "staging/collections/user/u1/",
      );
    });
  });
});

describe("isSafePublicObjectKey", () => {
  it.each([
    "prod/collections/user/u1/0f8b7c1e-aa.webp",
    "dev/products/product-images/p1/card.webp",
    "staging/collections/collection-covers/x.jpg",
  ])("accepts %s", (key) => {
    expect(isSafePublicObjectKey(key)).toBe(true);
  });

  it.each([
    "/prod/collections/a.webp",
    "prod/collections/../documents/a.pdf",
    "prod/collections/.hidden",
    "prod/collections/a%20b.webp",
    "prod/collections/a b.webp",
    "prod/documents/a.pdf",
    "prod/collections",
  ])("refuses %s", (key) => {
    expect(isSafePublicObjectKey(key)).toBe(false);
  });
});
