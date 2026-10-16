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

/** Gerçekten değişen bir anahtar satırı (denetim kaydının konusu). */
export interface HeroHomeVisibilityChange {
  platform: ClientPlatform;
  settingId: string;
  settingKey: string;
  before: boolean;
  after: boolean;
}

export interface HeroHomeVisibilityUpdate {
  visibility: HeroHomeVisibilityDto;
  changes: HeroHomeVisibilityChange[];
}

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
    return readHome(this.prisma);
  }

  /**
   * Yama: alan yok = dokunma; değeri zaten aynı olan anahtar yazılmaz. Önceki
   * değer yazımla AYNI işlemde okunur, dönen `changes` gerçekten değişen
   * satırları (kimlikleriyle) taşır — denetim kaydı bunlardan yazılır. Web'in
   * ana sayfa hero etiketi yalnız `web` anahtarı değiştiyse tazelenir (mobil
   * 60 sn önbellekle kendiliğinden görür).
   */
  async updateHome(
    patch: Partial<HeroHomeVisibilityDto>,
  ): Promise<HeroHomeVisibilityUpdate> {
    const requested = CLIENT_PLATFORMS.filter((p) => patch[p] !== undefined);
    if (requested.length === 0) {
      return { visibility: await this.getHome(), changes: [] };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const before = await readHome(tx);
      const changes: HeroHomeVisibilityChange[] = [];
      for (const platform of requested) {
        const next = patch[platform];
        if (next === undefined || next === before[platform]) continue;
        const settingKey = HERO_HOME_ENABLED_SETTING[platform];
        const settingValue = String(next);
        const row = await tx.platformSetting.upsert({
          where: { settingKey },
          create: {
            settingKey,
            settingValue,
            settingType: "boolean",
            description: SETTING_DESCRIPTION[platform],
          },
          update: { settingValue },
          select: { id: true },
        });
        changes.push({
          platform,
          settingId: row.id,
          settingKey,
          before: before[platform],
          after: next,
        });
      }
      const visibility = { ...before };
      for (const change of changes) visibility[change.platform] = change.after;
      return { visibility, changes };
    });

    if (result.changes.some((c) => c.platform === "web")) {
      void notifyWebRevalidate(heroRevalidateTags(["home"]));
    }
    return result;
  }
}

type SettingReader = Pick<PrismaService, "platformSetting">;

/** İki anahtarı okur — servis ya da işlem istemcisiyle. */
async function readHome(db: SettingReader): Promise<HeroHomeVisibilityDto> {
  const rows = await db.platformSetting.findMany({
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
