import { BadRequestException } from "@nestjs/common";
import { ContentFilterService } from "./content-filter.service";

/**
 * S9a — Apple 1.2: teklif notu ve takas mesajı mesajlaşmayla AYNI filtreden
 * geçer. Onay kuyruğu olmadığı için DM'nin üç sonucu şöyle eşlenir: temiz →
 * aynen, yalnız maskelenen kural → maskeli metin, onay isteyen sonuç → 400.
 */
describe("ContentFilterService.screenUnqueuedText", () => {
  const makeService = (
    rules: Array<{ name: string; pattern: string; requiresApproval: boolean }>,
    ai: { toxic: boolean; reason?: string } | null = null,
  ) => {
    const prisma = {
      contentFilter: {
        findMany: jest.fn().mockResolvedValue(
          rules.map((rule, i) => ({
            id: `f${i}`,
            filterType: "contact",
            name: rule.name,
            pattern: rule.pattern,
            replacement: "***",
            requiresApproval: rule.requiresApproval,
            priority: 0,
          })),
        ),
      },
    };
    const aiClient = { moderateText: jest.fn().mockResolvedValue(ai) };
    const service = new ContentFilterService(
      prisma as never,
      aiClient as never,
    );
    return { service, aiClient };
  };

  it("temiz metin aynen döner", async () => {
    const { service } = makeService([]);
    await service.loadFilters();

    await expect(
      service.screenUnqueuedText("Bu fiyata olur mu?"),
    ).resolves.toBe("Bu fiyata olur mu?");
  });

  it.each([undefined, null, "", "   "])(
    "boş metin (%p) filtreye uğramaz",
    async (input) => {
      const { service, aiClient } = makeService([]);

      await expect(service.screenUnqueuedText(input)).resolves.toBe(input);
      expect(aiClient.moderateText).not.toHaveBeenCalled();
    },
  );

  it("onay istemeyen kural (iletişim bilgisi) maskelenir", async () => {
    const { service } = makeService([
      { name: "Telefon", pattern: "\\d{10}", requiresApproval: false },
    ]);
    await service.loadFilters();

    await expect(service.screenUnqueuedText("Ara: 5551112233")).resolves.toBe(
      "Ara: ***",
    );
  });

  it("onay isteyen kural reddedilir (kuyruk yok)", async () => {
    const { service } = makeService([
      { name: "URL", pattern: "https?://\\S+", requiresApproval: true },
    ]);
    await service.loadFilters();

    const error = await service
      .screenUnqueuedText("bak https://ornek.com")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      i18nKey: "server.messaging.contentRejected",
    });
  });

  it("küfür listesi (AI'dan bağımsız) reddedilir", async () => {
    const { service } = makeService([]);
    await service.loadFilters();

    await expect(service.screenUnqueuedText("orospu")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("AI toksik dediği metin reddedilir", async () => {
    const { service } = makeService([], { toxic: true, reason: "insult" });
    await service.loadFilters();

    await expect(
      service.screenUnqueuedText("kibar görünen ama toksik"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
