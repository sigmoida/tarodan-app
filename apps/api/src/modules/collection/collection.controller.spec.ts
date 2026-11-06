import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { CollectionController } from "./collection.controller";

/**
 * Multipart `image` on POST /collections/:id/items. The collections bucket is
 * public, so the stored URL is the permanent public URL `MediaService.upload`
 * returns, written to the same per-user folder `POST /media/upload?folder=collections`
 * uses. It used to be a 7-day presigned URL that broke after a week.
 */
const USER = "11111111-1111-4111-8111-111111111111";
const COLLECTION = "33333333-3333-4333-8333-333333333333";
const PUBLIC_URL = `https://amzn-tarodan.s3.eu-west-1.amazonaws.com/prod/collections/user/${USER}/a.webp`;

function makeController(uploadResult: { key: string; url?: string }) {
  const collectionService = {
    addItemToCollection: jest.fn(async () => ({ id: "item" })),
    assertCanEditItems: jest.fn(async () => undefined),
  };
  const mediaService = { upload: jest.fn(async () => uploadResult) };
  const moderationAi = { assertImageClean: jest.fn(async () => undefined) };
  const controller = new CollectionController(
    collectionService as never,
    mediaService as never,
    moderationAi as never,
  );
  return { controller, collectionService, mediaService, moderationAi };
}

const file = {
  buffer: Buffer.from("x"),
  mimetype: "image/jpeg",
} as Express.Multer.File;
const req = { user: { id: USER } };

describe("CollectionController.addItemToCollection: multipart image", () => {
  it("passes the permanent public URL to the service", async () => {
    const { controller, collectionService, mediaService } = makeController({
      key: `prod/collections/user/${USER}/a.webp`,
      url: PUBLIC_URL,
    });
    const dto = { customTitle: "Tomica" };

    await controller.addItemToCollection(COLLECTION, req, dto, file);

    expect(mediaService.upload).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        bucket: "collections",
        folder: `user/${USER}`,
      }),
      USER,
    );
    expect(collectionService.addItemToCollection).toHaveBeenCalledWith(
      COLLECTION,
      USER,
      dto,
      PUBLIC_URL,
    );
    const [, , , stored] = collectionService.addItemToCollection.mock
      .calls[0] as unknown as [string, string, unknown, string];
    expect(stored).not.toMatch(/X-Amz-/);
  });

  it("moderates the image before uploading it", async () => {
    const { controller, moderationAi, mediaService } = makeController({
      key: "k",
      url: PUBLIC_URL,
    });
    moderationAi.assertImageClean.mockRejectedValueOnce(
      new BadRequestException("rejected"),
    );
    await expect(
      controller.addItemToCollection(
        COLLECTION,
        req,
        { customTitle: "T" },
        file,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mediaService.upload).not.toHaveBeenCalled();
  });

  it("fails with imageUploadFailed instead of storing an item without its URL", async () => {
    const { controller, collectionService } = makeController({ key: "k" });
    const error = await controller
      .addItemToCollection(COLLECTION, req, { customTitle: "T" }, file)
      .catch((e: BadRequestException) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      i18nKey: "server.collection.imageUploadFailed",
    });
    expect(collectionService.addItemToCollection).not.toHaveBeenCalled();
  });

  it("without a file, passes no URL (the body field is validated by the service)", async () => {
    const { controller, collectionService, mediaService } = makeController({
      key: "k",
    });
    const dto = { customTitle: "T", customImageUrl: PUBLIC_URL };
    await controller.addItemToCollection(COLLECTION, req, dto, undefined);
    expect(mediaService.upload).not.toHaveBeenCalled();
    expect(collectionService.addItemToCollection).toHaveBeenCalledWith(
      COLLECTION,
      USER,
      dto,
      undefined,
    );
  });
});

describe("CollectionController.addItemToCollection: nothing is uploaded for a refused request", () => {
  it("checks the caller may edit the collection before moderating or uploading", async () => {
    const { controller, collectionService, mediaService, moderationAi } =
      makeController({ key: "k", url: PUBLIC_URL });
    collectionService.assertCanEditItems.mockRejectedValueOnce(
      new ForbiddenException("not yours"),
    );
    await expect(
      controller.addItemToCollection(
        COLLECTION,
        req,
        { customTitle: "T" },
        file,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(collectionService.assertCanEditItems).toHaveBeenCalledWith(
      COLLECTION,
      USER,
    );
    expect(moderationAi.assertImageClean).not.toHaveBeenCalled();
    expect(mediaService.upload).not.toHaveBeenCalled();
    expect(collectionService.addItemToCollection).not.toHaveBeenCalled();
  });

  it("ignores the image of a listing item (productId) without uploading it", async () => {
    const { controller, collectionService, mediaService } = makeController({
      key: "k",
      url: PUBLIC_URL,
    });
    const dto = { productId: "44444444-4444-4444-8444-444444444444" };
    await controller.addItemToCollection(COLLECTION, req, dto, file);
    expect(mediaService.upload).not.toHaveBeenCalled();
    expect(collectionService.addItemToCollection).toHaveBeenCalledWith(
      COLLECTION,
      USER,
      dto,
      undefined,
    );
  });
});
