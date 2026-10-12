/**
 * Logo Netsis (NetOpenX REST) yapılandırması — TEK kaynak.
 *
 * Varsayılanlar burada bir kez yazılır; `NetsisModule` bunları `NETSIS_CONFIG`
 * token'ı olarak enjekte eder (testler düz nesne verir), boot doğrulaması
 * (`env.validation.ts`) ise mod listesini buradan okur. Smoke script'i
 * (`scripts/netsis-smoke.mjs`) TS içe aktaramadığı için aynı anahtarları ve
 * varsayılanları kendisi okur — biri değişirse ikisi birlikte değişmeli.
 *
 * ⚠ Buradaki her anahtar `config/env.validation.ts`'te BİLDİRİLMİŞ olmalı: zod
 * şeması bilinmeyen anahtarları siler, bildirilmemiş bir key `.env`
 * dosyasından hiç ulaşmaz ve sessizce aşağıdaki varsayılan kazanır.
 */

/** `stub` = ağa çıkmayan bellek içi sahte; `live` = gerçek NetOpenX REST. */
export const NETSIS_MODES = ["stub", "live"] as const;
export type NetsisMode = (typeof NETSIS_MODES)[number];

export const NETSIS_DEFAULTS = {
  mode: "stub",
  dbType: "vtMSSQL",
  branchCode: "0",
  timeoutMs: 15_000,
  tokenSafetySeconds: 60,
} as const satisfies {
  mode: NetsisMode;
  dbType: string;
  branchCode: string;
  timeoutMs: number;
  tokenSafetySeconds: number;
};

export interface NetsisConfig {
  enabled: boolean;
  mode: NetsisMode;
  /** Sonunda `/` olmadan, ör. `https://netsis.musteri.local:7070`. */
  baseUrl: string;
  username: string;
  password: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dbType: string;
  branchCode: string;
  timeoutMs: number;
  /** Token, Netsis'in verdiği süreden bu kadar saniye ÖNCE önbellekten düşer. */
  tokenSafetySeconds: number;
}

/** Bilinen bir mod değilse `null` — doğrulama bunu boot hatasına çevirir. */
export function parseNetsisMode(raw: string | undefined): NetsisMode | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return NETSIS_DEFAULTS.mode;
  return (NETSIS_MODES as readonly string[]).includes(value)
    ? (value as NetsisMode)
    : null;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number((raw ?? "").trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = Number((raw ?? "").trim());
  return (raw ?? "").trim() !== "" && Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : fallback;
}

/** `NETSIS_ENABLED` — varsayılan kapalı. */
export function netsisEnabled(): boolean {
  return ["true", "1"].includes(
    (process.env.NETSIS_ENABLED ?? "").trim().toLowerCase(),
  );
}

/**
 * Tüm Netsis ayarları. Tanınmayan bir mod `stub`'a düşer: canlı/staging boot
 * doğrulaması bunu zaten durdurur; yerelde yanlış yazım ağa çıkmamalı.
 */
export function netsisConfig(): NetsisConfig {
  const env = process.env;
  return {
    enabled: netsisEnabled(),
    mode: parseNetsisMode(env.NETSIS_MODE) ?? NETSIS_DEFAULTS.mode,
    baseUrl: (env.NETSIS_BASE_URL ?? "").trim().replace(/\/+$/, ""),
    username: env.NETSIS_USERNAME ?? "",
    password: env.NETSIS_PASSWORD ?? "",
    dbName: env.NETSIS_DB_NAME ?? "",
    dbUser: env.NETSIS_DB_USER ?? "",
    dbPassword: env.NETSIS_DB_PASSWORD ?? "",
    dbType: env.NETSIS_DB_TYPE?.trim() || NETSIS_DEFAULTS.dbType,
    branchCode: env.NETSIS_BRANCH_CODE?.trim() || NETSIS_DEFAULTS.branchCode,
    timeoutMs: positiveInt(env.NETSIS_TIMEOUT_MS, NETSIS_DEFAULTS.timeoutMs),
    tokenSafetySeconds: nonNegativeInt(
      env.NETSIS_TOKEN_SAFETY_SECONDS,
      NETSIS_DEFAULTS.tokenSafetySeconds,
    ),
  };
}
