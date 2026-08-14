import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { RequestUser } from "../auth/interfaces/jwt-payload.interface";
import { i18nMessage } from "../i18n";

/**
 * Dosya (mediaFile) için nesne-seviyesi yetkilendirme — TEK KAYNAK.
 *
 * Tüm yazma/silme/üzerine-yazma işlemleri bu kapıdan geçmek zorundadır.
 * Kural: dosyayı yükleyen kullanıcı VEYA admin işlem yapabilir.
 *
 * Not: Private içeriklerin OKUNMASI, ilgili modülün kendi yetkili
 * endpoint'inden yapılır (ör. fatura → invoice.service.getByOrderId).
 * Bu yüzden burada şimdilik uploader + admin kuralı yeterlidir;
 * entity-tabanlı okuma kuralları ileride buraya eklenebilir.
 */
@Injectable()
export class MediaAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kullanıcının verilen key'li dosyayı değiştirme/silme yetkisi var mı?
   * Yetki yoksa fırlatır (Forbidden), dosya yoksa NotFound.
   * Başarılı olursa dosyanın gerçek bucket/key bilgisini döner (doğru silme için).
   */
  async assertCanModify(
    key: string,
    user: RequestUser | undefined,
  ): Promise<{ bucket: string; key: string }> {
    if (!user?.id) {
      throw new ForbiddenException(i18nMessage("server.media.actionForbidden"));
    }

    const file = await this.prisma.mediaFile.findUnique({
      where: { key },
      select: { bucket: true, key: true, uploaderId: true },
    });

    if (!file) {
      throw new NotFoundException(i18nMessage("server.media.fileMissing"));
    }

    if (!user.isAdmin && (!file.uploaderId || file.uploaderId !== user.id)) {
      throw new ForbiddenException(i18nMessage("server.media.fileForbidden"));
    }

    return { bucket: file.bucket, key: file.key };
  }
}
