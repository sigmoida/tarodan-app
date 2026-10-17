import type { ContentPlatform } from "@tarodan/types";
import type { AdPosition } from "./types";

/**
 * Reklam görsel boyutu önerileri — pozisyon + platform başına TEK kaynak.
 *
 * Genişlik/yükseklik API'de opsiyoneldir ve yalnız yer ayırma (görsel yüklenene
 * kadar en-boy oranı) ile alan yerleşiminde yedek olarak kullanılır; yüklenen
 * görselin kendi oranı önceliklidir. Bu yüzden ön ayarlar zorunlu değil, "önerilen
 * boyut" çipleridir.
 */

/** Öneri tablosunun iki sütunu; `all` platformu ikisini birden gösterir. */
export type AdSizeTarget = "web" | "app";

/** i18n anahtarı son eki: `admin.marketing.ads.sizePreset.<id>`. */
export type AdSizePresetId =
  | "strip"
  | "billboard"
  | "leaderboard"
  | "mobileBanner"
  | "mobileLeaderboard"
  | "mediumRectangle"
  | "square"
  | "largeMobileBanner";

export interface AdSizePreset {
  id: AdSizePresetId;
  width: number;
  height: number;
}

export interface AdSize {
  width: number;
  height: number;
}

const p = (
  id: AdSizePresetId,
  width: number,
  height: number,
): AdSizePreset => ({
  id,
  width,
  height,
});

const STRIP = p("strip", 970, 90);
const BILLBOARD = p("billboard", 970, 250);
const LEADERBOARD = p("leaderboard", 728, 90);
const MOBILE_BANNER = p("mobileBanner", 320, 100);
const MOBILE_LEADERBOARD = p("mobileLeaderboard", 320, 50);
const MEDIUM_RECTANGLE = p("mediumRectangle", 300, 250);
const SQUARE = p("square", 250, 250);
const LARGE_MOBILE_BANNER = p("largeMobileBanner", 320, 480);

const BANNER_SLOT: Record<AdSizeTarget, readonly AdSizePreset[]> = {
  web: [BILLBOARD, LEADERBOARD],
  app: [MOBILE_BANNER, MOBILE_LEADERBOARD],
};

export const AD_SIZE_PRESETS: Record<
  AdPosition,
  Record<AdSizeTarget, readonly AdSizePreset[]>
> = {
  topbar: { web: [STRIP], app: [STRIP] },
  header: BANNER_SLOT,
  footer: BANNER_SLOT,
  inline: BANNER_SLOT,
  popup: {
    web: [MEDIUM_RECTANGLE, SQUARE],
    app: [LARGE_MOBILE_BANNER, MEDIUM_RECTANGLE],
  },
};

/** En-boy oranı bu orandan (göreli) fazla sapıyorsa uyarı verilir. */
export const RATIO_WARN_TOLERANCE = 0.25;

const sameSize = (a: AdSize, b: AdSize) =>
  a.width === b.width && a.height === b.height;

const hasSize = (s: AdSize) => s.width > 0 && s.height > 0;

/** Platform hedefi → gösterilecek sütunlar (`all` = web + uygulama). */
export function sizeTargets(platform: ContentPlatform): AdSizeTarget[] {
  return platform === "all" ? ["web", "app"] : [platform];
}

export interface AdSizeGroup {
  target: AdSizeTarget;
  presets: readonly AdSizePreset[];
}

/** Seçili pozisyon + platform için önerilen boyut grupları (etiketli gruplar). */
export function sizePresetGroups(
  position: string,
  platform: ContentPlatform,
): AdSizeGroup[] {
  const table = AD_SIZE_PRESETS[position as AdPosition];
  if (!table) return [];
  return sizeTargets(platform).map((target) => ({
    target,
    presets: table[target],
  }));
}

/** Tüm gruplar aynı boyutları öneriyorsa (ör. topbar) gruplamaya gerek yoktur. */
export function groupsAreIdentical(groups: readonly AdSizeGroup[]): boolean {
  if (groups.length < 2) return true;
  const key = (g: AdSizeGroup) =>
    g.presets.map((x) => `${x.width}x${x.height}`).join(",");
  return groups.every((g) => key(g) === key(groups[0]));
}

/** Gruplar düz liste olarak (aynı boyut bir kez). */
export function recommendedSizes(
  position: string,
  platform: ContentPlatform,
): AdSizePreset[] {
  const out: AdSizePreset[] = [];
  for (const g of sizePresetGroups(position, platform)) {
    for (const preset of g.presets) {
      if (!out.some((o) => sameSize(o, preset))) out.push(preset);
    }
  }
  return out;
}

/** Boyut bu yuva için önerilenlerden biri mi? */
export function matchPreset(
  position: string,
  platform: ContentPlatform,
  size: AdSize,
): AdSizePreset | undefined {
  return recommendedSizes(position, platform).find((x) => sameSize(x, size));
}

/**
 * Kayıtlı/algılanan boyut hiçbir öneriyle eşleşmiyorsa "Özel" çipi gösterilir;
 * böylece veri korunur ve kayıtta sessizce değişmez.
 */
export function customSize(
  position: string,
  platform: ContentPlatform,
  size: AdSize,
): AdSize | null {
  if (!hasSize(size)) return null;
  return matchPreset(position, platform, size) ? null : size;
}

/** Boyutun nereden geldiği: çip, görselden okuma ya da kayıtlı reklam. */
export type AdSizeSource = "none" | "preset" | "image" | "stored";

export interface SizeState {
  size: AdSize;
  source: AdSizeSource;
}

/**
 * Pozisyon/platform değişince: artık uygulanmayan ÇİP seçimi temizlenir.
 * Çipten gelen boyut, varsa görselin doğal boyutuna geri döner (yoksa boşalır);
 * görselden algılanan ve kayıtlı boyutlar korunur.
 */
export function sizeAfterContextChange(args: {
  position: string;
  platform: ContentPlatform;
  state: SizeState;
  natural: AdSize | null;
}): SizeState {
  const { position, platform, state, natural } = args;
  if (state.source !== "preset") return state;
  if (matchPreset(position, platform, state.size)) return state;
  return natural && hasSize(natural)
    ? { size: natural, source: "image" }
    : { size: { width: 0, height: 0 }, source: "none" };
}

export type RatioDirection = "tall" | "wide";

export interface RatioMismatch {
  direction: RatioDirection;
  recommended: AdSizePreset[];
}

/**
 * Görselin oranı, bu yuva için önerilen oranların HİÇBİRİNE `tolerance` içinde
 * yakın değilse uyarı verisi döner (engellemez). `tall`: önerilenden daha
 * uzun/kare, `wide`: daha yassı.
 */
export function ratioMismatch(args: {
  position: string;
  platform: ContentPlatform;
  size: AdSize;
  tolerance?: number;
}): RatioMismatch | null {
  const { position, platform, size, tolerance = RATIO_WARN_TOLERANCE } = args;
  if (!hasSize(size)) return null;
  const recommended = recommendedSizes(position, platform);
  if (recommended.length === 0) return null;
  const ratio = size.width / size.height;
  const deviations = recommended.map(
    (r) => Math.abs(ratio - r.width / r.height) / (r.width / r.height),
  );
  if (deviations.some((d) => d <= tolerance)) return null;
  const nearest = recommended.reduce((best, r, i) =>
    deviations[i] < deviations[recommended.indexOf(best)] ? r : best,
  );
  return {
    direction: ratio < nearest.width / nearest.height ? "tall" : "wide",
    recommended,
  };
}

/** "970×250, 728×90" */
export const formatSizes = (sizes: readonly AdSize[]): string =>
  sizes.map((s) => `${s.width}×${s.height}`).join(", ");
