import { Logger } from "@nestjs/common";
import { PaytrMerchant } from "@prisma/client";
import { MiscReconciliationService } from "./misc-reconciliation.service";

/**
 * capiListCards PayTR hatasında / zaman aşımında / boş yanıtta `[]` döner.
 * Bildirim utoken taşıdığı halde liste boşsa kart sessizce yazılmıyordu —
 * ayırt edici bir uyarı satırı bunu görünür kılar (dönüş sözleşmesi aynı).
 */
describe("MiscReconciliationService.syncSavedCardsFromUtoken — empty capi/list", () => {
  function setup(cards: Array<Record<string, unknown>>) {
    const capiListCards = jest.fn().mockResolvedValue(cards);
    const prisma = { savedCard: { upsert: jest.fn().mockResolvedValue({}) } };
    const svc = new MiscReconciliationService(
      prisma as never,
      { resolve: jest.fn(() => ({ capiListCards })) } as never,
    );
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    return { svc, prisma, warn };
  }

  afterEach(() => jest.restoreAllMocks());

  it("warns with a distinct line and returns 0 when the list is empty/failed", async () => {
    const { svc, prisma, warn } = setup([]);
    await expect(
      svc.syncSavedCardsFromUtoken(
        "user-1",
        "ut-1",
        undefined,
        PaytrMerchant.membership,
      ),
    ).resolves.toBe(0);
    expect(prisma.savedCard.upsert).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "[saved-card-sync] utoken present but capi/list empty/failed",
      ),
    );
    // utoken kimlik bilgisi gibi davranır; günlüğe yazılmaz.
    expect(String(warn.mock.calls[0][0])).not.toContain("ut-1");
  });

  it("does not warn when cards are returned", async () => {
    const { svc, prisma, warn } = setup([{ ctoken: "ct-1", last4: "4242" }]);
    await expect(svc.syncSavedCardsFromUtoken("user-1", "ut-1")).resolves.toBe(
      1,
    );
    expect(prisma.savedCard.upsert).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
