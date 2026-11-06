// A chainable sharp double: the cover generator's image maths is not under
// test here, only which URLs it requests.
jest.mock("sharp", () => {
  const chain = () => {
    const api: Record<string, unknown> = {};
    for (const step of ["autoOrient", "resize", "composite", "jpeg"]) {
      api[step] = () => api;
    }
    api.toBuffer = async () => Buffer.from("jpeg");
    return api;
  };
  const sharp = Object.assign(jest.fn(chain), { block: jest.fn() });
  return sharp;
});

import { CollectionCoverService } from "./collection-cover.service";
import { StorageService } from "../storage/storage.service";

const S3_ROOT = "https://amzn-tarodan.s3.eu-west-1.amazonaws.com";
const COLLECTION = "33333333-3333-4333-8333-333333333333";
const OWN_CUSTOM = `${S3_ROOT}/prod/collections/user/u1/a.webp`;
const OWN_CARD_KEY = "prod/products/product-images/p1/card.webp";

function makeStorage(): StorageService {
  const values: Record<string, string> = {
    NODE_ENV: "production",
    S3_BUCKET: "amzn-tarodan",
    AWS_REGION: "eu-west-1",
    S3_PUBLIC_BASE_URL: S3_ROOT,
  };
  const config = {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  };
  return new StorageService(config as never, {} as never);
}

type Item = {
  id: string;
  customImageUrl: string | null;
  product: { images: { cardKey: string | null }[] } | null;
};

const custom = (id: string, url: string): Item => ({
  id,
  customImageUrl: url,
  product: null,
});
const listing = (id: string, cardKey: string): Item => ({
  id,
  customImageUrl: null,
  product: { images: [{ cardKey }] },
});

function makeService(items: Item[]) {
  const prisma = {
    collection: {
      findUnique: jest.fn(async () => ({ id: COLLECTION, items })),
      update: jest.fn(async () => ({})),
    },
  };
  const mediaService = {
    uploadBuffer: jest.fn(async () => ({
      key: "prod/collections/collection-covers/c.jpg",
    })),
  };
  const service = new CollectionCoverService(
    prisma as never,
    mediaService as never,
    makeStorage(),
    {} as never,
  );
  return { service, prisma, mediaService };
}

describe("CollectionCoverService.generateCoverImage: source URLs", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(Buffer.from("img")));
  });

  afterEach(() => fetchSpy.mockRestore());

  const requestedUrls = () => fetchSpy.mock.calls.map(([url]) => String(url));

  it.each([
    ["another host", "https://evil.example.com/a.webp"],
    [
      "the cloud metadata address",
      "http://169.254.169.254/latest/meta-data/iam",
    ],
    ["localhost", "http://localhost:3000/internal"],
    [
      "a presigned URL on our bucket",
      `${OWN_CUSTOM}?X-Amz-Signature=abc&X-Amz-Expires=604800`,
    ],
    ["a bare private key", "prod/messages/u1/secret.webp"],
    ["a bare public key", "prod/collections/user/u1/a.webp"],
    [
      "a traversal on our host",
      `${S3_ROOT}/prod/collections/../documents/invoice.pdf`,
    ],
  ])("never requests a custom image on %s", async (_label, url) => {
    const { service, mediaService } = makeService([custom("i1", url)]);
    await expect(service.generateCoverImage(COLLECTION)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mediaService.uploadBuffer).not.toHaveBeenCalled();
  });

  it("skips a listing whose card key is not a safe public key", async () => {
    const { service } = makeService([
      listing("i1", "prod/documents/invoice.pdf"),
    ]);
    await expect(service.generateCoverImage(COLLECTION)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requests only own URLs, rebuilt from the key, without following redirects", async () => {
    const { service, mediaService } = makeService([
      custom("i1", "https://evil.example.com/a.webp"),
      custom("i2", OWN_CUSTOM),
      listing("i3", OWN_CARD_KEY),
      custom("i4", "http://169.254.169.254/"),
    ]);
    await expect(service.generateCoverImage(COLLECTION)).resolves.toBe(
      "prod/collections/collection-covers/c.jpg",
    );
    // Fewer than four sources: the first one becomes a single cover.
    expect(requestedUrls()).toEqual([OWN_CUSTOM]);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init).toEqual(
      expect.objectContaining({
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mediaService.uploadBuffer).toHaveBeenCalledTimes(1);
  });

  it("builds the grid from own sources only when four are present", async () => {
    const { service } = makeService([
      custom("i1", OWN_CUSTOM),
      listing("i2", OWN_CARD_KEY),
      custom("i3", `${S3_ROOT}/prod/collections/user/u1/b.webp`),
      listing("i4", "prod/products/product-images/p2/card.webp"),
    ]);
    await service.generateCoverImage(COLLECTION);
    expect(requestedUrls()).toEqual([
      OWN_CUSTOM,
      `${S3_ROOT}/${OWN_CARD_KEY}`,
      `${S3_ROOT}/prod/collections/user/u1/b.webp`,
      `${S3_ROOT}/prod/products/product-images/p2/card.webp`,
    ]);
    for (const url of requestedUrls()) {
      expect(url.startsWith(`${S3_ROOT}/`)).toBe(true);
    }
  });

  it("does not store a cover when the own download is refused (redirect)", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed: redirect"));
    const { service, prisma } = makeService([custom("i1", OWN_CUSTOM)]);
    await expect(service.generateCoverImage(COLLECTION)).resolves.toBeNull();
    expect(prisma.collection.update).not.toHaveBeenCalled();
  });
});
