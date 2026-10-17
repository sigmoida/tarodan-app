import { Injectable } from "@nestjs/common";
import { MessageStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { MESSAGE_ATTACHMENT_PATH } from "../../media/helpers/message-attachment-url";

/** Mesaj eki okuma kararı için gereken dosya alanları. */
export interface MessageAttachmentFileRef {
  id: string;
  uploaderId: string | null;
}

/**
 * Private mesaj ekini (`messages` kökü) kim OKUYABİLİR — tek kaynak.
 *
 * Ek, mesajdan ÖNCE yüklenir ve `MediaFile` konu bilgisi taşımaz; konuya bağı
 * mesaj gövdesindeki `[IMG:<API_URL>/api/media/message-attachment/<id>]`
 * işaretidir. Bu yüzden erişim:
 *
 *  - yükleyen kullanıcı (mesaja eklemeden önce önizleme dahil), ya da
 *  - eki gövdesinde taşıyan bir mesajın ALICISI — mesaj YÜKLEYENİN gönderdiği
 *    ve alıcıya görünen (sent/approved, silinmemiş) bir mesaj olmalı.
 *
 * "Gönderen = yükleyen" koşulu, başkasının ek id'sini kendi mesajına gömerek
 * (gönderim doğrulaması öncesi yazılmış eski mesajlar) o eke erişim kazanmayı
 * kapatır. Yükleyeni bilinmeyen eski kayıtlarda yalnız mesajın tarafları
 * (gönderen/alıcı) okuyabilir.
 *
 * Mesaj tablosu bu modülün; media modülü bu servisi (döngü olmadan) kullanır.
 */
@Injectable()
export class MessageAttachmentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async canRead(
    file: MessageAttachmentFileRef,
    requesterId: string,
  ): Promise<boolean> {
    if (file.uploaderId && file.uploaderId === requesterId) return true;

    const marker = `${MESSAGE_ATTACHMENT_PATH}${file.id}`;
    const message = await this.prisma.message.findFirst({
      where: {
        content: { contains: marker },
        deletedAt: null,
        status: { in: [MessageStatus.sent, MessageStatus.approved] },
        ...(file.uploaderId
          ? { senderId: file.uploaderId, receiverId: requesterId }
          : { OR: [{ senderId: requesterId }, { receiverId: requesterId }] }),
      },
      select: { id: true },
    });
    return message !== null;
  }
}
