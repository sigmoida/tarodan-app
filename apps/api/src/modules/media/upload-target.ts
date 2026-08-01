import { BadRequestException } from "@nestjs/common";

/**
 * Faz 0 — Yükleme hedefi SÖZLEŞMESİ (tek kaynak).
 *
 * İstemciden gelen `folder` yalnız bir AMAÇ etiketidir; bucket + gerçek klasörü
 * BURASI kurar. Eskiden istemcinin gönderdiği değer key şablonuna aynen
 * giriyordu: mesaj/review görselleri public `products/` çatısına düşüyor
 * (özel mesaj ekleri URL bilen herkese açık kalıyordu) ve istemci keyfi
 * klasör açabiliyordu.
 *
 * `private: true` hedefin yanıtı public S3 URL'si DEĞİL, yetkili servis ucudur
 * (message-attachment) — presigned okuma oradan yapılır.
 */
export interface UploadTarget {
  bucket: "products" | "avatars" | "collections" | "messages" | "reviews";
  folder: string;
  private: boolean;
}

export function resolveUploadTarget(
  folder: string | undefined,
  userId: string,
): UploadTarget {
  switch (folder ?? "uploads") {
    case "messages":
      return { bucket: "messages", folder: userId, private: true };
    case "reviews":
      return { bucket: "reviews", folder: userId, private: false };
    case "collections":
      return {
        bucket: "collections",
        folder: `user/${userId}`,
        private: false,
      };
    case "uploads":
    case "":
      // Eski istemciler (mobil dahil) folder'sız yüklüyor — davranış korunur.
      return { bucket: "products", folder: "uploads", private: false };
    default:
      throw new BadRequestException(
        `Geçersiz yükleme hedefi: ${folder}. İzinli hedefler: messages, reviews, collections`,
      );
  }
}
