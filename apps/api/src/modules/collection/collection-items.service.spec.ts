import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { CollectionItemsService } from "./collection-items.service";
import { StorageService } from "../storage/storage.service";

/**
 * Custom item image URLs and reorder scoping. The storage service is the real
 * one (only its config is faked) so the URL rules under test are the ones
 * production runs.
 */
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const COLLECTION = "33333333-3333-4333-8333-333333333333";
const ITEM_A = "44444444-4444-4444-8444-444444444444";
const ITEM_B = "55555555-5555-4555-8555-555555555555";
const FOREIGN_ITEM = "66666666-6666-4666-8666-666666666666";
const S3_ROOT = "https://amzn-tarodan.s3.eu-west-1.amazonaws.com";
const OWN_IMAGE = `${S3_ROOT}/prod/collections/user/${OWNER}/0f8b7c1e.webp`;

function makeStorage(publicBase = S3_ROOT): StorageService {
  const values: Record<string, string> = {
    NODE_ENV: "production",
    S3_BUCKET: "amzn-tarodan",
    AWS_REGION: "eu-west-1",
    S3_PUBLIC_BASE_URL: publicBase,
  };
  const config = {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  };
  return new StorageService(config as never, {} as never);
}

/** Prisma double whose interactive transaction commits only on success. */
function makePrisma(itemsByCollection: Record<string, string[]>) {
  const sortOrders = new Map<string, number>();
  const prisma = {
    collection: {
      findUnique: jest.fn(async () => ({ id: COLLECTION, userId: OWNER })),
    },
    collectionItem: {
      aggregate: jest.fn(async () => ({ _max: { sortOrder: 2 } })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: ITEM_A,
        ...data,
      })),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
        const staged = new Map<string, number>();
        const tx = {
          collectionItem: {
            updateMany: jest.fn(
              async ({
                where,
                data,
              }: {
                where: { id: string; collectionId: string };
                data: { sortOrder: number };
              }) => {
                prisma.collectionItem.updateMany({ where, data });
                const owned = (
                  itemsByCollection[where.collectionId] ?? []
                ).includes(where.id);
                if (owned) staged.set(where.id, data.sortOrder);
                return { count: owned ? 1 : 0 };
              },
            ),
          },
        };
        const result = await fn(tx);
        staged.forEach((value, id) => sortOrders.set(id, value));
        return result;
      },
    ),
  };
  return { prisma, sortOrders };
}

function makeService(storage = makeStorage()) {
  const { prisma, sortOrders } = makePrisma({
    [COLLECTION]: [ITEM_A, ITEM_B],
    "77777777-7777-4777-8777-777777777777": [FOREIGN_ITEM],
  });
  const common = { mapItemToDto: jest.fn(async (item: unknown) => item) };
  const service = new CollectionItemsService(
    prisma as never,
    common as never,
    storage,
  );
  return { service, prisma, sortOrders };
}

async function caught(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error("expected the call to throw");
}

describe("CollectionItemsService.addItemToCollection: custom item image", () => {
  it("stores the caller's own collection upload URL unchanged", async () => {
    const { service, prisma } = makeService();
    await service.addItemToCollection(COLLECTION, OWNER, {
      customTitle: "Tomica",
      customImageUrl: OWN_IMAGE,
    });
    expect(prisma.collectionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customImageUrl: OWN_IMAGE }),
      }),
    );
  });

  it("stores the canonical public-base URL when the S3 form is sent under a CDN base", async () => {
    const { service, prisma } = makeService(
      makeStorage("https://cdn.example.com"),
    );
    await service.addItemToCollection(COLLECTION, OWNER, {
      customTitle: "Tomica",
      customImageUrl: OWN_IMAGE,
    });
    expect(prisma.collectionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customImageUrl: `https://cdn.example.com/prod/collections/user/${OWNER}/0f8b7c1e.webp`,
        }),
      }),
    );
  });

  it.each<[string | undefined, string]>([
    [undefined, "absent"],
    ["", "empty"],
    ["   ", "blank"],
  ])("stores no image when the URL is %p (%s)", async (url) => {
    const { service, prisma } = makeService();
    await service.addItemToCollection(COLLECTION, OWNER, {
      customTitle: "Tomica",
      customImageUrl: url,
    });
    expect(prisma.collectionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customImageUrl: null }),
      }),
    );
  });

  it.each([
    ["another host", "https://evil.example.com/a.webp"],
    ["the metadata address", "http://169.254.169.254/latest/meta-data/"],
    ["localhost", `http://localhost/prod/collections/user/${OWNER}/a.webp`],
    ["http on our host", OWN_IMAGE.replace("https://", "http://")],
    ["credentials", OWN_IMAGE.replace("https://", "https://u:p@")],
    ["a presigned URL", `${OWN_IMAGE}?X-Amz-Signature=abc`],
    [
      "another user's folder",
      `${S3_ROOT}/prod/collections/user/${OTHER_USER}/a.webp`,
    ],
    [
      "a traversal out of the own folder",
      `${S3_ROOT}/prod/collections/user/${OWNER}/../${OTHER_USER}/a.webp`,
    ],
    [
      "an encoded traversal",
      `${S3_ROOT}/prod/collections/user/${OWNER}/%2e%2e/x.webp`,
    ],
    [
      "the collections root outside a user folder",
      `${S3_ROOT}/prod/collections/collection-covers/a.jpg`,
    ],
    ["the product uploads folder", `${S3_ROOT}/prod/products/uploads/a.webp`],
    [
      "another environment",
      `${S3_ROOT}/staging/collections/user/${OWNER}/a.webp`,
    ],
    ["a private bucket", `${S3_ROOT}/prod/messages/${OWNER}/a.webp`],
    ["a bare key", `prod/collections/user/${OWNER}/a.webp`],
    ["a non-URL", "not a url"],
  ])(
    "refuses %s with 400 invalidImageUrl and stores nothing",
    async (_label, url) => {
      const { service, prisma } = makeService();
      const error = await caught(
        service.addItemToCollection(COLLECTION, OWNER, {
          customTitle: "Tomica",
          customImageUrl: url,
        }),
      );
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toEqual({
        i18nKey: "server.collection.invalidImageUrl",
      });
      expect(prisma.collectionItem.create).not.toHaveBeenCalled();
      expect(prisma.collectionItem.aggregate).not.toHaveBeenCalled();
    },
  );

  it("refuses every URL while the public base is not configured", async () => {
    const { service, prisma } = makeService(makeStorage(""));
    const error = await caught(
      service.addItemToCollection(COLLECTION, OWNER, {
        customTitle: "Tomica",
        customImageUrl: OWN_IMAGE,
      }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.collectionItem.create).not.toHaveBeenCalled();
  });

  it("uses the multipart upload URL over the body field and validates it the same way", async () => {
    const { service, prisma } = makeService();
    await service.addItemToCollection(
      COLLECTION,
      OWNER,
      {
        customTitle: "Tomica",
        customImageUrl: "https://evil.example.com/a.webp",
      },
      OWN_IMAGE,
    );
    expect(prisma.collectionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customImageUrl: OWN_IMAGE }),
      }),
    );
  });

  it("refuses a non-owner with the i18n editForbidden key", async () => {
    const { service, prisma } = makeService();
    const error = await caught(
      service.addItemToCollection(COLLECTION, OTHER_USER, {
        customTitle: "Tomica",
        customImageUrl: OWN_IMAGE,
      }),
    );
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual({
      i18nKey: "server.collection.editForbidden",
    });
    expect(prisma.collectionItem.create).not.toHaveBeenCalled();
  });
});

describe("CollectionItemsService.removeItemFromCollection", () => {
  it("refuses a non-owner with the i18n editForbidden key", async () => {
    const { service } = makeService();
    const error = await caught(
      service.removeItemFromCollection(COLLECTION, ITEM_A, OTHER_USER),
    );
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual({
      i18nKey: "server.collection.editForbidden",
    });
  });
});

describe("CollectionItemsService.reorderItems", () => {
  it("updates the collection's own items, each update scoped to the collection", async () => {
    const { service, prisma, sortOrders } = makeService();
    await service.reorderItems(COLLECTION, OWNER, {
      items: [
        { itemId: ITEM_A, sortOrder: 2 },
        { itemId: ITEM_B, sortOrder: 1 },
      ],
    });
    expect(sortOrders.get(ITEM_A)).toBe(2);
    expect(sortOrders.get(ITEM_B)).toBe(1);
    for (const [call] of prisma.collectionItem.updateMany.mock.calls) {
      expect(call.where).toEqual(
        expect.objectContaining({ collectionId: COLLECTION }),
      );
    }
  });

  it("404s on an item of another collection and changes nothing", async () => {
    const { service, sortOrders } = makeService();
    const error = await caught(
      service.reorderItems(COLLECTION, OWNER, {
        items: [
          { itemId: ITEM_A, sortOrder: 5 },
          { itemId: FOREIGN_ITEM, sortOrder: 0 },
        ],
      }),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({
      i18nKey: "server.collection.itemNotFound",
    });
    expect(sortOrders.size).toBe(0);
  });

  it("refuses a non-owner before any write", async () => {
    const { service, prisma } = makeService();
    const error = await caught(
      service.reorderItems(COLLECTION, OTHER_USER, {
        items: [{ itemId: ITEM_A, sortOrder: 0 }],
      }),
    );
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("404s on an unknown collection", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findUnique.mockResolvedValueOnce(null as never);
    const error = await caught(
      service.reorderItems(COLLECTION, OWNER, { items: [] }),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
