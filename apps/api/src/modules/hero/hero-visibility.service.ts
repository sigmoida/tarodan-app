import { Injectable } from "@nestjs/common";
import {
  CLIENT_PLATFORMS,
  HERO_HOME_ENABLED_SETTING,
  parseHeroHomeEnabled,
  type ClientPlatform,
  type HeroHomeVisibilityDto,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { notifyWebRevalidate } from "../../common/helpers/revalidate";
import { heroRevalidateTags } from "./helpers/hero.constants";

/** Ayar satırının açıklaması (Ayarlar ekranında ham listede görünür). */
const SETTING_DESCRIPTION: Readonly<Record<ClientPlatform, string>> = {
  web: "Ana sayfa hero slider'ı sitede gösterilsin mi (false = gizli)",
  app: "Ana sayfa hero slider'ı mobil uygulamada gösterilsin mi (false = gizli)",
};

/**
 * Ana sayfa hero'sunun istemci başına anahtarı (`hero_home_enabled_web|app`,
 * PlatformSetting). Kapalı istemcinin ana sayfa okuması boş döner — slayt
 * satırlarına dokunmadan hero'yu bir istemcide gizlemenin yolu. Satır yoksa
 * açık: anahtar hiç yazılmamış kurulum bugünkü gibi davranır. Auth
 * yerleşimleri bu anahtardan etkilenmez.
 */
@Injectable()
export class HeroVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ana sayfa hero'su bu istemcide açık mı. */
  async isHomeEnabled(platform: ClientPlatform): Promise<boolean> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { settingKey: HERO_HOME_ENABLED_SETTING[platform] },
      select: { settingValue: true },
    });
    return parseHeroHomeEnabled(row?.settingValue);
  }

  /** İki istemcinin anahtarı birden (admin). */
  async getHome(): Promise<HeroHomeVisibilityDto> {
    const rows = await this.prisma.platformSetting.findMany({
      where: {
        settingKey: {
          in: CLIENT_PLATFORMS.map((p) => HERO_HOME_ENABLED_SETTING[p]),
        },
      },
      select: { settingKey: true, settingValue: true },
    });
    const byKey = new Map(rows.map((r) => [r.settingKey, r.settingValue]));
    return {
      web: parseHeroHomeEnabled(byKey.get(HERO_HOME_ENABLED_SETTING.web)),
      app: parseHeroHomeEnabled(byKey.get(HERO_HOME_ENABLED_SETTING.app)),
    };
  }

  /**
   * Yama: alan yok = dokunma. Bir anahtar yazıldıysa web'in ana sayfa hero
   * etiketi tazelenir (mobil 60 sn önbellekle kendiliğinden görür).
   */
  async updateHome(
    patch: Partial<HeroHomeVisibilityDto>,
  ): Promise<HeroHomeVisibilityDto> {
    const changed = CLIENT_PLATFORMS.filter((p) => patch[p] !== undefined);
    if (changed.length > 0) {
      await this.prisma.$transaction(
        changed.map((platform) => {
          const settingKey = HERO_HOME_ENABLED_SETTING[platform];
          const settingValue = String(patch[platform]);
          return this.prisma.platformSetting.upsert({
            where: { settingKey },
            create: {
              settingKey,
              settingValue,
              settingType: "boolean",
              description: SETTING_DESCRIPTION[platform],
            },
            update: { settingValue },
          });
        }),
      );
      void notifyWebRevalidate(heroRevalidateTags(["home"]));
    }
    return this.getHome();
  }
}
