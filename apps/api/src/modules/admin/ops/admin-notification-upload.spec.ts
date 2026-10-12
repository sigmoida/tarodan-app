import { BadRequestException } from "@nestjs/common";
import { AdminNotificationService } from "./admin-notification.service";
import { NOTIFICATION_IMAGE_UPLOAD } from "./notification-image-upload.constants";

/**
 * `POST /admin/notifications/upload`: görsel public kökte `notifications/`
 * klasörüne, jpeg/png/webp ve 5 MB sınırıyla yüklenir.
 */
describe("AdminNotificationService.uploadImage", () => {
  const makeService = () => {
    const media = {
      upload: jest.fn().mockResolvedValue({
        url: "https://cdn.test/products/notifications/a.webp",
        key: "products/notifications/a.webp",
        bucket: "products",
        size: 10,
        mimeType: "image/webp",
      }),
    };
    const service = new AdminNotificationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      media as never,
    );
    return { service, media };
  };

  it("uploads to the public notifications folder and returns the media result", async () => {
    const { service, media } = makeService();
    const file = { originalname: "a.webp" } as Express.Multer.File;

    const result = await service.uploadImage(file);

    expect(media.upload).toHaveBeenCalledWith(file, NOTIFICATION_IMAGE_UPLOAD);
    expect(result.url).toBe("https://cdn.test/products/notifications/a.webp");
  });

  it("pins the target: public bucket, notifications/, images only, 5 MB", () => {
    expect(NOTIFICATION_IMAGE_UPLOAD).toEqual({
      bucket: "products",
      folder: "notifications",
      allowedTypes: ["image/jpeg", "image/png", "image/webp"],
      maxSize: 5 * 1024 * 1024,
    });
  });

  it("rejects a request without a file before touching storage", async () => {
    const { service, media } = makeService();

    await expect(service.uploadImage(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(media.upload).not.toHaveBeenCalled();
  });
});
