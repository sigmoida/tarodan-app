import { Injectable, OnModuleInit } from "@nestjs/common";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import {
  OUTBOX_MEDIA_AVATAR_DELETE,
  type MediaAvatarDeletePayload,
} from "../outbox/outbox.types";
import { StorageService } from "../storage/storage.service";
import { AVATAR_BUCKET, avatarStorageKey } from "./helpers/avatar-deletion";

/**
 * Medya outbox handler'ları — hesap silmede avatar nesnesinin depolamadan
 * silinmesi (`enqueueAvatarDeletion`). Handler at-least-once çalışmaya
 * uygundur: zaten silinmiş nesneyi yeniden silmek no-op'tur.
 */
@Injectable()
export class MediaOutboxHandlers implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    this.registry.register(OUTBOX_MEDIA_AVATAR_DELETE, async (payload) => {
      const key = avatarStorageKey((payload as MediaAvatarDeletePayload).key);
      if (!key) return;
      // MediaFile kaydını ve nesneyi birlikte siler.
      await this.storage.deleteFile(AVATAR_BUCKET, key);
    });
  }
}
