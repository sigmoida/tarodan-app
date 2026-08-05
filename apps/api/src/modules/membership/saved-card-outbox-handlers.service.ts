import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SavedCardStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import {
  OUTBOX_SAVED_CARD_PROVIDER_DELETE,
  type SavedCardProviderDeletePayload,
} from "../outbox/outbox.types";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";

const isAlreadyAbsentResponse = (reason?: string): boolean => {
  const normalized = reason?.trim().toLocaleLowerCase("tr-TR") ?? "";
  return [
    "not found",
    "does not exist",
    "already deleted",
    "bulunamad",
    "mevcut değil",
    "zaten silin",
  ].some((fragment) => normalized.includes(fragment));
};

/**
 * Yerelde revoke edilen kartların sağlayıcı tarafındaki token'larını temizler.
 * Handler at-least-once çalışmaya uygundur: tekrar silme ve sağlayıcıda zaten
 * bulunmayan kart başarı kabul edilir; geçici hatalar outbox tarafından denenir.
 */
@Injectable()
export class SavedCardOutboxHandlers implements OnModuleInit {
  private readonly logger = new Logger(SavedCardOutboxHandlers.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly prisma: PrismaService,
    private readonly paymentProviders: PaymentProviderRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      OUTBOX_SAVED_CARD_PROVIDER_DELETE,
      async (payload) => {
        const { savedCardId } = payload as SavedCardProviderDeletePayload;
        const card = await this.prisma.savedCard.findUnique({
          where: { id: savedCardId },
        });

        if (!card) {
          this.logger.warn(
            `Kayıtlı kart sağlayıcı temizliği: card=${savedCardId} yerelde bulunamadı — no-op`,
          );
          return;
        }
        if (card.status !== SavedCardStatus.revoked) {
          this.logger.warn(
            `Kayıtlı kart sağlayıcı temizliği: card=${savedCardId} revoke değil — no-op`,
          );
          return;
        }

        const result = await this.paymentProviders
          .resolve(card.provider)
          .capiDeleteCard(card.utoken, card.ctoken);

        if (
          result.status.toLocaleLowerCase("en-US") === "success" ||
          isAlreadyAbsentResponse(result.reason)
        ) {
          return;
        }

        throw new Error(
          `Kayıtlı kart sağlayıcıdan silinemedi: ${result.reason || result.status}`,
        );
      },
    );
  }
}
