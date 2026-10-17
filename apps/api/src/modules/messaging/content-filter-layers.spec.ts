import { ContentFilterService } from "./content-filter.service";

/**
 * moderateWithAI üç katmanı (DB kuralları, küfür listesi, AI) HER ZAMAN
 * değerlendirir ve en ağır sonucu uygular. Regresyon: herhangi bir kural
 * eşleşince erken dönülüyordu — yalnız maskelenen bir kural (telefon)
 * eşleşen küfürlü mesaj maskelenip onaysız gidiyordu, AI'ya hiç sorulmuyordu.
 */
describe("ContentFilterService.moderateWithAI — tüm katmanlar", () => {
  const makeService = async (
    ai: { toxic: boolean; reason?: string } | null,
  ) => {
    const prisma = {
      contentFilter: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "f1",
            filterType: "phone",
            name: "Telefon",
            pattern: "\\d{10}",
            replacement: "***",
            requiresApproval: false,
            priority: 0,
          },
        ]),
      },
    };
    const aiClient = { moderateText: jest.fn().mockResolvedValue(ai) };
    const service = new ContentFilterService(
      prisma as never,
      aiClient as never,
    );
    await service.loadFilters();
    return { service, aiClient };
  };

  it("maske kuralı + küfür → küfür de yakalanır, onay gerekir", async () => {
    const { service } = await makeService(null);

    const result = await service.moderateWithAI("orospu 5551112233");

    expect(result.filteredContent).toBe("orospu ***");
    expect(result.profanity).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.flaggedPatterns).toEqual(["Telefon", "profanity"]);
  });

  it("maske kuralı eşleşse de AI'ya sorulur; toksikse onay gerekir", async () => {
    const { service, aiClient } = await makeService({
      toxic: true,
      reason: "insult",
    });

    const result = await service.moderateWithAI("kaba bir metin 5551112233");

    expect(aiClient.moderateText).toHaveBeenCalled();
    expect(result.aiFlagged).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.flaggedReason).toContain("AI moderasyon");
  });

  it("yalnız maske kuralı → maskelenir, onay gerekmez", async () => {
    const { service } = await makeService(null);

    const result = await service.moderateWithAI("Ara 5551112233");

    expect(result.isClean).toBe(false);
    expect(result.requiresApproval).toBe(false);
    expect(result.matches).toEqual([
      { name: "Telefon", filterType: "phone", requiresApproval: false },
    ]);
  });

  it("AI hatası diğer katmanları bozmaz", async () => {
    const { service, aiClient } = await makeService(null);
    aiClient.moderateText.mockRejectedValue(new Error("down"));

    const result = await service.moderateWithAI("Bu fiyata olur mu?");

    expect(result.isClean).toBe(true);
  });
});
