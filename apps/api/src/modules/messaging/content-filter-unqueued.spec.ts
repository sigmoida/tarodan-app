import { BadRequestException } from "@nestjs/common";
import { ContentFilterService } from "./content-filter.service";
import {
  EMAIL_PATTERN_SOURCE,
  INSTAGRAM_HANDLE_PATTERN_SOURCE,
  TR_MOBILE_PHONE_PATTERN_SOURCE,
  WHATSAPP_PATTERN_SOURCE,
} from "../../common/helpers/contact-patterns";

/**
 * S9a — Apple 1.2: teklif notu ve takas metinleri mesajlaşmayla AYNI filtreden
 * geçer; onay kuyruğu olmadığı için karşılık katmana göre ayrılır:
 * küfür → 400, iletişim bilgisi → maske, diğer onay isteyen kurallar ve AI →
 * maske + admin incelemesi (ModerationEvent "flag"), reddedilmez.
 *
 * Regresyon (yanlış pozitif → sert 400): küfür kökleri kelime içinde
 * eşleşiyordu ("tamamını" ⊃ "amını"), Instagram/WhatsApp kalıpları kelime
 * sınırsızdı ("Big Rig", "MiG 29"); hepsi requiresApproval olduğu için meşru
 * diecast notları reddediliyordu.
 */
describe("ContentFilterService.screenUnqueuedText", () => {
  /** seed.ts'teki kurallarla aynı (hepsi requiresApproval=true). */
  const seedRules = [
    {
      filterType: "phone",
      name: "Telefon",
      pattern: TR_MOBILE_PHONE_PATTERN_SOURCE,
      replacement: "[telefon gizlendi]",
    },
    {
      filterType: "email",
      name: "E-posta",
      pattern: EMAIL_PATTERN_SOURCE,
      replacement: "[email gizlendi]",
    },
    {
      filterType: "social_media",
      name: "WhatsApp",
      pattern: WHATSAPP_PATTERN_SOURCE,
      replacement: "[iletişim bilgisi gizlendi]",
    },
    {
      filterType: "social_media",
      name: "Instagram",
      pattern: INSTAGRAM_HANDLE_PATTERN_SOURCE,
      replacement: "[sosyal medya gizlendi]",
    },
  ];

  const makeService = async (
    extraRules: Array<{
      filterType: string;
      name: string;
      pattern: string;
      replacement: string;
    }> = [],
    ai: { toxic: boolean; reason?: string } | null = null,
  ) => {
    const prisma = {
      contentFilter: {
        findMany: jest.fn().mockResolvedValue(
          [...seedRules, ...extraRules].map((rule, i) => ({
            id: `f${i}`,
            ...rule,
            requiresApproval: true,
            priority: 0,
          })),
        ),
      },
    };
    const aiClient = {
      moderateText: jest.fn().mockResolvedValue(ai),
      recordEvent: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ContentFilterService(
      prisma as never,
      aiClient as never,
    );
    await service.loadFilters();
    return { service, aiClient };
  };

  const ctx = { entityType: "offer", userId: "u1", field: "offer_message" };

  it.each([
    "Fiyatın tamamını nakit öderim",
    "Kalanın tamamına ek 200 TL",
    "Big Rig modeli var mı?",
    "MiG 29 maketi ile takas",
    "Hot Wheels Big Air kutulu",
    "Tamamcık, anlaştık",
    "Kawasaki 1 adet",
  ])("meşru not aynen geçer: %s", async (text) => {
    const { service, aiClient } = await makeService();

    await expect(service.screenUnqueuedText(text, ctx)).resolves.toBe(text);
    expect(aiClient.recordEvent).not.toHaveBeenCalled();
  });

  it.each(["orospu çocuğu", "Siktir git", "AMINA KOYAYIM", "sana göt"])(
    "gerçek küfür reddedilir: %s",
    async (text) => {
      const { service } = await makeService();

      const error = await service
        .screenUnqueuedText(text, ctx)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        i18nKey: "server.messaging.contentRejected",
      });
    },
  );

  it.each([
    ["ig: tarodan_shop yaz", "[sosyal medya gizlendi] yaz"],
    // Kurallar sırayla uygulanır: numara önce telefon kuralıyla gizlenir.
    ["wp 05321234567", "wp [telefon gizlendi]"],
    ["Ara 0532 123 45 67", "Ara [telefon gizlendi]"],
    ["ali@example.com", "[email gizlendi]"],
  ])(
    "iletişim bilgisi maskelenir, reddedilmez, incelemeye düşmez: %s",
    async (text, masked) => {
      const { service, aiClient } = await makeService();

      await expect(service.screenUnqueuedText(text, ctx)).resolves.toBe(masked);
      expect(aiClient.recordEvent).not.toHaveBeenCalled();
    },
  );

  it("iletişim dışı onay isteyen kural: reddedilmez, maskelenir ve incelemeye işaretlenir", async () => {
    const { service, aiClient } = await makeService([
      {
        filterType: "custom",
        name: "Dolandırıcılık ifadesi",
        pattern: "kapora gönder",
        replacement: "[gizlendi]",
      },
    ]);

    await expect(
      service.screenUnqueuedText("önce kapora gönder", ctx),
    ).resolves.toBe("önce [gizlendi]");
    expect(aiClient.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "offer",
        userId: "u1",
        field: "offer_message",
        kind: "text",
        decision: "flag",
      }),
    );
  });

  it("AI toksik: reddedilmez, incelemeye işaretlenir", async () => {
    const { service, aiClient } = await makeService([], {
      toxic: true,
      reason: "insult",
    });

    await expect(
      service.screenUnqueuedText("kibar görünen ama toksik", ctx),
    ).resolves.toBe("kibar görünen ama toksik");
    expect(aiClient.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "flag" }),
    );
  });

  it.each([undefined, null, "", "   "])(
    "boş metin (%p) filtreye uğramaz",
    async (input) => {
      const { service, aiClient } = await makeService();

      await expect(service.screenUnqueuedText(input, ctx)).resolves.toBe(input);
      expect(aiClient.moderateText).not.toHaveBeenCalled();
    },
  );
});
