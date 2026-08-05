import { SavedCardStatus } from "@prisma/client";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import { OUTBOX_SAVED_CARD_PROVIDER_DELETE } from "../outbox/outbox.types";
import { SavedCardOutboxHandlers } from "./saved-card-outbox-handlers.service";

describe("SavedCardOutboxHandlers", () => {
  const makeService = (card: Record<string, unknown> | null) => {
    const registry = new OutboxHandlerRegistry();
    const prisma = {
      savedCard: { findUnique: jest.fn().mockResolvedValue(card) },
    };
    const provider = { capiDeleteCard: jest.fn() };
    const paymentProviders = {
      resolve: jest.fn().mockReturnValue(provider),
    };
    const service = new SavedCardOutboxHandlers(
      registry,
      prisma as any,
      paymentProviders as any,
    );
    service.onModuleInit();
    const handler = registry.get(OUTBOX_SAVED_CARD_PROVIDER_DELETE)!;
    return { handler, prisma, provider, paymentProviders };
  };

  const revokedCard = {
    id: "card-1",
    provider: "paytr",
    utoken: "utoken-1",
    ctoken: "ctoken-1",
    status: SavedCardStatus.revoked,
  };

  it("deletes the revoked card from its payment provider", async () => {
    const { handler, provider, paymentProviders } = makeService(revokedCard);
    provider.capiDeleteCard.mockResolvedValue({ status: "success" });

    await expect(
      handler({ savedCardId: "card-1" }, {} as any),
    ).resolves.toBeUndefined();
    expect(paymentProviders.resolve).toHaveBeenCalledWith("paytr");
    expect(provider.capiDeleteCard).toHaveBeenCalledWith(
      "utoken-1",
      "ctoken-1",
    );
  });

  it.each(["Card not found", "Kart bulunamadı", "Card was already deleted"])(
    "treats an already absent provider card as success: %s",
    async (reason) => {
      const { handler, provider } = makeService(revokedCard);
      provider.capiDeleteCard.mockResolvedValue({ status: "error", reason });

      await expect(
        handler({ savedCardId: "card-1" }, {} as any),
      ).resolves.toBeUndefined();
    },
  );

  it("throws on a transient provider failure so the outbox retries", async () => {
    const { handler, provider } = makeService(revokedCard);
    provider.capiDeleteCard.mockResolvedValue({
      status: "error",
      reason: "provider unavailable",
    });

    await expect(handler({ savedCardId: "card-1" }, {} as any)).rejects.toThrow(
      "provider unavailable",
    );
  });

  it("does not delete a card that is no longer revoked", async () => {
    const { handler, provider } = makeService({
      ...revokedCard,
      status: SavedCardStatus.active,
    });

    await expect(
      handler({ savedCardId: "card-1" }, {} as any),
    ).resolves.toBeUndefined();
    expect(provider.capiDeleteCard).not.toHaveBeenCalled();
  });

  it("is a no-op when the local card no longer exists", async () => {
    const { handler, provider } = makeService(null);

    await expect(
      handler({ savedCardId: "card-1" }, {} as any),
    ).resolves.toBeUndefined();
    expect(provider.capiDeleteCard).not.toHaveBeenCalled();
  });
});
