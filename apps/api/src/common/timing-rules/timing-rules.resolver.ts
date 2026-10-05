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
 * Bir katmandaki değer boş, sayı olmayan ya da 1'den küçükse o katman YOK
 * sayılır ve bir sonrakine düşülür: hatalı bir ayar yüzünden pencere sıfırlanıp
 * para erken serbest kalmasın, sipariş anında iptal olmasın. Ondalık değer aşağı
 * yuvarlanır. Admin sınırları (min/max, değişmezler) YAZMADA uygulanır, okumada
 * değil — env'deki eski bir değer bugün neyse öyle kalır.
 *
 * Okuma önbelleksizdir: her çağrı tek bir indeksli satır okur ve süreler damga
 * anında (son tarih yazılırken) ya da cron turunun başında okunur. Böylece admin
 * değişikliği web ve worker süreçlerinde aynı anda, gecikmesiz geçerli olur.
 */

/** Tek ayar satırı okuyabilen minimum Prisma yüzeyi (PrismaService ya da tx). */
export interface TimingSettingReader {
  platformSetting: {
    findUnique(args: {
      where: { settingKey: string };
    }): Promise<{ settingValue: string } | null>;
  };
}

/** Toplu okuma yüzeyi — ekranlar ve alarm turları tüm kayıtları birden okur. */
export interface TimingSettingListReader {
  platformSetting: {
    findMany(args: {
      where: { settingKey: { in: string[] } };
    }): Promise<
      Array<{ settingKey: string; settingValue: string; updatedAt: Date }>
    >;
  };
}

/** Bir çözüm turunun tüm etkin değerleri (alarm/dashboard yardımcılarına geçer). */
export type TimingValues = Readonly<Record<TimingRuleId, number>>;

export interface ResolvedTimingValue {
  value: number;
  source: TimingValueSource;
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

/** Katman sırasını uygulayan saf adım (ayar → env → varsayılan). */
export function pickTimingValue(
  id: TimingRuleId,
  settingRaw: string | null | undefined,
  env: TimingEnvReader = processEnvTimingReader,
): ResolvedTimingValue {
  const fromSetting = parseTimingValue(settingRaw);
  if (fromSetting !== null) return { value: fromSetting, source: "setting" };
  const envKey = TIMING_RULES[id].envKey;
  if (envKey) {
    const fromEnv = parseTimingValue(env.get(envKey));
    if (fromEnv !== null) return { value: fromEnv, source: "env" };
  }
  return { value: TIMING_RULES[id].default, source: "default" };
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
  return pickTimingValue(id, row?.settingValue, env).value;
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
    const { value, source } = pickTimingValue(id, valueRow?.settingValue, env);
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
