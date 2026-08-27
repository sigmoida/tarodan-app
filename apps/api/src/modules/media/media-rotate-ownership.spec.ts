import { ForbiddenException } from "@nestjs/common";
import { MediaService } from "./media.service";

/**
 * Kayıtlı bir ürün görselini yalnız SAHİBİ çevirebilir.
 *
 * Sahiplik iki yoldan kabul edilir, çünkü depoda iki anahtar şeması var:
 * yeni şemadaki anahtar kullanıcının yükleme klasöründedir, eski şemadakiler
 * ise DEĞİLDİR. Yalnız klasöre bakmak, kayıtların çoğunu (eski şema) sahibi
 * tarafından bile çevrilemez yapıyordu — 403 ile.
 */
describe("MediaService — görsel çevirmede sahiplik", () => {
  const OWNER = "user-1";
  const OWN_FOLDER_KEY = `dev/products/product-images/temp/u/${OWNER}/abc-detail.webp`;
  const LEGACY_KEY = "dev/products/product-images/product-9/def-detail.webp";

  const makeService = (linkedToOwner: boolean) => {
    const prisma = {
      productImage: {
        count: jest.fn().mockResolvedValue(linkedToOwner ? 1 : 0),
      },
    };
    const storageService = {
      downloadFileByKey: jest
        .fn()
        .mockRejectedValue(new Error("indirmeye gerek yok")),
    };
    const service = new MediaService(
      {} as never, // configService
      {} as never, // membershipService
      storageService as never,
      prisma as never,
    );
    return { service, prisma, storageService };
  };

  it("kendi yükleme klasöründeki anahtarı çevirebilir", async () => {
    const { service } = makeService(false);

    // Klasör eşleştiği için DB'ye hiç bakılmadan geçer; ilerisi (indirme)
    // mock'lanmadığı için patlar — ölçtüğümüz şey kapının açılması.
    const err = await service
      .rotateProductImageVariants(OWN_FOLDER_KEY, OWNER)
      .catch((e) => e);

    expect(err).not.toBeInstanceOf(ForbiddenException);
  });

  it("ESKİ şemadaki kendi görselini de çevirebilir", async () => {
    const { service, prisma } = makeService(true);

    const err = await service
      .rotateProductImageVariants(LEGACY_KEY, OWNER)
      .catch((e) => e);

    expect(err).not.toBeInstanceOf(ForbiddenException);
    // Ölçüt: anahtar kullanıcının kendi ürününe hâlen bağlı mı.
    expect(prisma.productImage.count).toHaveBeenCalledWith({
      where: { detailKey: LEGACY_KEY, product: { sellerId: OWNER } },
    });
  });

  it("başkasının görselini çeviremez", async () => {
    const { service, storageService } = makeService(false);

    await expect(
      service.rotateProductImageVariants(LEGACY_KEY, OWNER),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Reddedilen istek depoya HİÇ gitmemeli.
    expect(storageService.downloadFileByKey).not.toHaveBeenCalled();
  });
});
