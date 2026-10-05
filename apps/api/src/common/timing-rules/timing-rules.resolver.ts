import {
  TIMING_RULES,
  TIMING_RULE_IDS,
  isSelectableTimingAction,
  timingActionSettingKey,
  type AdminTimingRuleState,
  type TimingExpiryAction,
  type TimingRuleId,
  type TimingValueSource,
} from "@tarodan/types";
import {
  processEnvTimingReader,
  type TimingEnvReader,
} from "../../config/timing-env";

/**
 * İŞ SÜRELERİNİN OKUMA KATMANI — tek kaynak.
 *
 * Her süre (`TIMING_RULES`, `@tarodan/types`) üç katmandan çözülür:
 *   1) PlatformSetting satırı — admin "Süreler ve Kurallar" ekranından yazar.
 *   2) Kaydın eski env değişkeni (`envKey`) — yalnız ilk kurulum geri düşüşü.
 *   3) Kayıt varsayılanı — bugünkü kod varsayılanı.
 * Admin bir değer kaydedene kadar sonuç, taşımadan önceki env/sabit okumasıyla
 * aynıdır; deploy tek başına hiçbir süreyi değiştirmez.
 *
 * ESKİ SATIRLAR: `updatedBy` alanı boş (null) bir satır bu ekrandan önce
 * yazılmıştır (seed ya da eski genel ayar ucu). Eski kod env'i olan kayıtlarda
 * bu satırları HİÇ okumuyordu (ör. seed'deki `offer_expiry_hours=24` ölüydü,
 * kod OFFER_EXPIRY_HOURS'u okuyordu). Bu yüzden eski satır env değişkeninin
 * ÖNÜNE GEÇMEZ: env ayarlıysa env, değilse satır, o da yoksa varsayılan. Env'i
 * olmayan kayıtlarda (takas süreleri, payment_hold_days) eski satır eskisi gibi
 * okunur. Süreler ve Kurallar ucunun yazdığı satırlar `updatedBy` taşır ve her
 * zaman kazanır.
 *
 * SINIR DIŞI DEĞERLER — karar: bir katmandaki değer boş, sayı olmayan ya da
 * 1'den küçükse o katman YOK sayılır ve bir sonrakine düşülür; akışı çökerten
 * tek değerler bunlardır (sıfır/eksi pencere parayı anında açar, siparişi anında
 * iptal eder) ve asla üretilmez. Ondalık değer aşağı yuvarlanır. 1 ve üstü ama
 * admin sınırlarının (min/max) DIŞINDAKİ bir değer — ör. env'de
 * RETURN_WINDOW_DAYS=7 ya da eski ekrandan girilmiş 500 saatlik takas yanıtı —
 * bugün nasıl uygulanıyorsa öyle uygulanmaya devam eder (deploy davranış
 * değiştirmez) ama SESSİZ kalmaz: `outOfBounds` ile işaretlenir, admin
 * ekranında uyarı olarak görünür ve admin düzeltebilir. Sınırlar ve alanlar
 * arası kurallar YAZMADA dayatılır.
 *
 * Okuma önbelleksizdir: her çağrı tek bir indeksli satır okur ve süreler damga
 * anında (son tarih yazılırken) ya da cron turunun başında okunur. Böylece admin
 * değişikliği web ve worker süreçlerinde aynı anda, gecikmesiz geçerli olur.
 */

/**
 * Okunan ayar satırı. `updatedBy === null` = bu ekrandan önce yazılmış eski
 * satır (yukarıdaki ESKİ SATIRLAR kuralı); Prisma alanı her zaman döndürür.
 */
export interface TimingSettingRow {
  settingValue: string;
  updatedBy?: string | null;
}

/** Tek ayar satırı okuyabilen minimum Prisma yüzeyi (PrismaService ya da tx). */
export interface TimingSettingReader {
  platformSetting: {
    findUnique(args: {
      where: { settingKey: string };
    }): Promise<TimingSettingRow | null>;
  };
}

/** Toplu okuma yüzeyi — ekranlar ve alarm turları tüm kayıtları birden okur. */
export interface TimingSettingListReader {
  platformSetting: {
    findMany(args: {
      where: { settingKey: { in: string[] } };
    }): Promise<
      Array<TimingSettingRow & { settingKey: string; updatedAt: Date }>
    >;
  };
}

/** Bir çözüm turunun tüm etkin değerleri (alarm/dashboard yardımcılarına geçer). */
export type TimingValues = Readonly<Record<TimingRuleId, number>>;

export interface ResolvedTimingValue {
  value: number;
  source: TimingValueSource;
  /** Değer admin sınırlarının dışında (uygulanır ama ekranda uyarılır). */
  outOfBounds: boolean;
}

/**
 * Ham ayar/env metnini süreye çevirir. Boş, sayı olmayan ya da 1'den küçük
 * değer `null` döner (katman yok sayılır). Boş dize ayrıca elenir:
 * `Number("") === 0` pencereyi sıfıra çekerdi.
 */
export function parseTimingValue(
  raw: string | null | undefined,
): number | null {
  if (raw === undefined || raw === null || `${raw}`.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

/**
 * Katman sırasını uygulayan saf adım: ayar → env → varsayılan. Eski (updatedBy
 * null) satır env'in önüne geçmez.
 */
export function pickTimingValue(
  id: TimingRuleId,
  settingRow: TimingSettingRow | null | undefined,
  env: TimingEnvReader = processEnvTimingReader,
): ResolvedTimingValue {
  const rule = TIMING_RULES[id];
  const withBounds = (
    value: number,
    source: TimingValueSource,
  ): ResolvedTimingValue => ({
    value,
    source,
    outOfBounds: value < rule.min || value > rule.max,
  });

  const fromSetting = parseTimingValue(settingRow?.settingValue);
  const isLegacyRow = settingRow?.updatedBy === null;
  if (fromSetting !== null && !isLegacyRow) {
    return withBounds(fromSetting, "setting");
  }
  const fromEnv = rule.envKey ? parseTimingValue(env.get(rule.envKey)) : null;
  if (fromEnv !== null) return withBounds(fromEnv, "env");
  // Eski satır yalnız env yokken geçerlidir.
  if (fromSetting !== null) return withBounds(fromSetting, "setting");
  return withBounds(rule.default, "default");
}

/**
 * Seçili eylem. Satır yoksa, tanımsız ya da henüz açılmamış bir eylem taşıyorsa
 * (ör. DB'ye elle yazılmış) bugünkü davranış — `defaultAction` — geçerlidir.
 */
export function pickTimingAction(
  id: TimingRuleId,
  raw: string | null | undefined,
): TimingExpiryAction {
  const value = raw?.trim();
  return value && isSelectableTimingAction(id, value)
    ? value
    : TIMING_RULES[id].defaultAction;
}

/** Tek sürenin etkin değeri. Damga anında ya da cron turunun başında çağrılır. */
export async function resolveTimingValue(
  db: TimingSettingReader,
  id: TimingRuleId,
  env: TimingEnvReader = processEnvTimingReader,
): Promise<number> {
  const row = await db.platformSetting.findUnique({
    where: { settingKey: TIMING_RULES[id].settingKey },
  });
  return pickTimingValue(id, row, env).value;
}

/** Tek sürenin seçili eylemi. */
export async function resolveTimingAction(
  db: TimingSettingReader,
  id: TimingRuleId,
): Promise<TimingExpiryAction> {
  const row = await db.platformSetting.findUnique({
    where: { settingKey: timingActionSettingKey(id) },
  });
  return pickTimingAction(id, row?.settingValue);
}

/** Tüm kayıtların durumu (değer + kaynak + eylem + son güncelleme), tek sorguda. */
export async function loadTimingRuleStates(
  db: TimingSettingListReader,
  env: TimingEnvReader = processEnvTimingReader,
): Promise<AdminTimingRuleState[]> {
  const keys = TIMING_RULE_IDS.flatMap((id) => [
    TIMING_RULES[id].settingKey,
    timingActionSettingKey(id),
  ]);
  const rows = await db.platformSetting.findMany({
    where: { settingKey: { in: keys } },
  });
  const byKey = new Map(rows.map((row) => [row.settingKey, row]));

  return TIMING_RULE_IDS.map((id) => {
    const valueRow = byKey.get(TIMING_RULES[id].settingKey);
    const actionRow = byKey.get(timingActionSettingKey(id));
    const { value, source, outOfBounds } = pickTimingValue(id, valueRow, env);
    const updatedAt = [valueRow?.updatedAt, actionRow?.updatedAt]
      .filter((date): date is Date => date instanceof Date)
      .reduce<Date | null>(
        (latest, date) => (!latest || date > latest ? date : latest),
        null,
      );
    return {
      id,
      value,
      source,
      outOfBounds,
      action: pickTimingAction(id, actionRow?.settingValue),
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
    };
  });
}

/** Durum listesinden yalnız değerler — alarm/dashboard yardımcılarının girdisi. */
export function timingValuesOf(
  states: readonly AdminTimingRuleState[],
): TimingValues {
  return Object.fromEntries(
    states.map((state) => [state.id, state.value]),
  ) as Record<TimingRuleId, number>;
}

/** Bir turdaki tüm etkin değerler (tek sorgu). */
export async function loadTimingValues(
  db: TimingSettingListReader,
  env: TimingEnvReader = processEnvTimingReader,
): Promise<TimingValues> {
  return timingValuesOf(await loadTimingRuleStates(db, env));
}

/**
 * Hiç ayar ve env yokken geçerli değerler (kayıt varsayılanları). Testler ve
 * "bugünkü davranış" karşılaştırmaları için.
 */
export function defaultTimingValues(): TimingValues {
  return Object.fromEntries(
    TIMING_RULE_IDS.map((id) => [id, TIMING_RULES[id].default]),
  ) as Record<TimingRuleId, number>;
}
