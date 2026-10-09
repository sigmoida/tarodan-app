import { isLiveDeployment } from "../../../config/environment";

/**
 * Maskeleme çalıştırıcısının HEDEF guard'ı — saf, DB'ye dokunmaz.
 *
 * Çalıştırıcı bağlandığı veritabanının her kişisel kolonunu geri dönülmez
 * biçimde ezer. Yanlış veritabanında (production'ın kendisi ya da canlı
 * staging) tek bir koşu felakettir; bu yüzden üç bağımsız kilit birlikte ister:
 *
 *  1. `UAT_MASK_TARGET=scratch` açıkça verilmiş olmalı;
 *  2. hedefin adı `_uat_scratch` ile bitmeli (workflow'un açtığı geçici DB);
 *  3. hedef, `UAT_MASK_FORBIDDEN_DATABASE_URL` ile verilen production
 *     veritabanıyla aynı ada sahip olmamalı (aynı sunucuda ya da değil).
 *     Bu URL kimlik bilgisi TAŞIMAZ (`postgresql://host/db`): production şifresi
 *     staging konteynerine hiç girmez.
 *
 * Ek olarak süreç canlı dağıtımda (APP_ENV=production) çalışıyorsa reddeder.
 * Hata mesajları yalnız host ve veritabanı adını söyler, şifreyi asla.
 */

export const UAT_MASK_TARGET_ENV = "UAT_MASK_TARGET";
export const UAT_MASK_FORBIDDEN_URL_ENV = "UAT_MASK_FORBIDDEN_DATABASE_URL";
export const UAT_MASK_TARGET_VALUE = "scratch";
export const UAT_SCRATCH_DATABASE_SUFFIX = "_uat_scratch";

export interface MaskTarget {
  url: string;
  host: string;
  database: string;
}

function parseDatabaseUrl(
  value: string | undefined,
  name: string,
): { host: string; database: string } {
  let parsed: URL;
  try {
    parsed = new URL(String(value ?? "").trim());
  } catch {
    throw new Error(`${name} is not a valid database URL`);
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error(`${name} must be a postgres:// URL`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !database) {
    throw new Error(`${name} must name a host and a database`);
  }
  return { host: parsed.hostname.toLowerCase(), database };
}

export function resolveMaskTarget(
  env: Record<string, string | undefined>,
): MaskTarget {
  if (isLiveDeployment(env.NODE_ENV, env.APP_ENV)) {
    throw new Error(
      "UAT masking refuses to run on the live production deployment.",
    );
  }
  if (env[UAT_MASK_TARGET_ENV]?.trim() !== UAT_MASK_TARGET_VALUE) {
    throw new Error(
      `${UAT_MASK_TARGET_ENV}=${UAT_MASK_TARGET_VALUE} is required: the runner overwrites every personal column of the database it connects to.`,
    );
  }
  const target = parseDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");
  if (!target.database.endsWith(UAT_SCRATCH_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to mask database "${target.database}" on ${target.host}: only a scratch database whose name ends with "${UAT_SCRATCH_DATABASE_SUFFIX}" may be masked.`,
    );
  }
  if (!env[UAT_MASK_FORBIDDEN_URL_ENV]?.trim()) {
    throw new Error(
      `${UAT_MASK_FORBIDDEN_URL_ENV} (the production database, host + name, no credentials) is required.`,
    );
  }
  const forbidden = parseDatabaseUrl(
    env[UAT_MASK_FORBIDDEN_URL_ENV],
    UAT_MASK_FORBIDDEN_URL_ENV,
  );
  if (forbidden.database.toLowerCase() === target.database.toLowerCase()) {
    throw new Error(
      `Refusing to mask "${target.database}": it has the production database's name.`,
    );
  }
  return { url: String(env.DATABASE_URL).trim(), ...target };
}

/**
 * `UAT_SOURCE_SNAPSHOT_AT`: workflow'un production dökümünü aldığı an. Özet
 * bunu aynen taşır; geçersizse `null` — yanlış bir zaman damgası göstermektense
 * hiç.
 */
export function resolveSourceSnapshotAt(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
