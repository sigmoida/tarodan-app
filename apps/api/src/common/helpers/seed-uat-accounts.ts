import { AdminRole } from "@prisma/client";
import { resolveSeedProductAssetBase } from "./seed-media-mapping";

/**
 * UAT seed'inin (`prisma/seed-uat.ts`) SAF parçaları: hesap listesi doğrulaması,
 * ortam guard'ı, şifre kuralı ve "mevcut hesaba ne yazılır" kararı. DB'ye
 * dokunmaz; bu yüzden birim testle kilitlenir. Seed dosyası yalnız bunların
 * kararını Prisma'ya uygular.
 */

export const UAT_PASSWORD_ENV = "UAT_SEED_PASSWORD";
export const UAT_RESET_PASSWORDS_ENV = "UAT_SEED_RESET_PASSWORDS";

/** bootstrap-production-admin ve lansman satıcısıyla aynı alt sınır. */
export const UAT_PASSWORD_MIN_LENGTH = 16;
/** bcrypt 72 baytın ötesini sessizce keser; kesilen şifreyi kabul etmeyiz. */
export const UAT_PASSWORD_MAX_BYTES = 72;

/** Platform servis hesabı hiçbir zaman üye/personel olarak açılamaz. */
const PLATFORM_EMAIL = "platform@tarodan.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UatAccountKind = "member" | "staff";

export interface UatMember {
  email: string;
  displayName: string;
}

export interface UatStaff extends UatMember {
  role: AdminRole;
}

export interface UatAccounts {
  members: UatMember[];
  staff: UatStaff[];
}

export interface UatListing {
  ownerEmail: string;
  slug: string;
  /** seed-assets taban adı; verilmezse ilan görselsiz kalır. */
  imageAssetBase?: string;
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isTruthyFlag = (value: string | undefined): boolean =>
  ["1", "true"].includes((value ?? "").trim().toLowerCase());

/**
 * UAT seed yalnız `APP_ENV=staging` ile ya da yerel geliştirmede koşar. İzin
 * LİSTESİDİR: derlenmiş (NODE_ENV=production) bir konteynerde `APP_ENV` boşsa
 * ya da başka bir değerse reddedilir — "production değil" demek yetmez.
 */
export function assertUatSeedAllowed(
  env: Record<string, string | undefined>,
): void {
  const appEnv = (env.APP_ENV ?? "").trim().toLowerCase();
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  if (appEnv === "production") {
    throw new Error(
      "UAT seed refuses to run with APP_ENV=production; it is for staging/UAT only.",
    );
  }
  if (appEnv !== "staging" && nodeEnv === "production") {
    throw new Error(
      "UAT seed refuses to run in a production build unless APP_ENV=staging.",
    );
  }
}

/**
 * Başlangıç şifresini env'den okur ve doğrular. Hata mesajları değeri ASLA
 * içermez (log'a sızmasın).
 */
export function resolveUatPassword(
  env: Record<string, string | undefined>,
): string {
  const password = env[UAT_PASSWORD_ENV]?.trim();
  if (!password) {
    throw new Error(`${UAT_PASSWORD_ENV} is required`);
  }
  if (
    password.length < UAT_PASSWORD_MIN_LENGTH ||
    Buffer.byteLength(password, "utf8") > UAT_PASSWORD_MAX_BYTES
  ) {
    throw new Error(
      `${UAT_PASSWORD_ENV} must be ${UAT_PASSWORD_MIN_LENGTH}+ characters and at most ${UAT_PASSWORD_MAX_BYTES} bytes`,
    );
  }
  return password;
}

/** Var olan hesapların şifresini yeniden yazmak AÇIK bir bayrak ister. */
export function shouldResetPasswords(
  env: Record<string, string | undefined>,
): boolean {
  return isTruthyFlag(env[UAT_RESET_PASSWORDS_ENV]);
}

export interface UatSyncPlan {
  /** Hesap yoksa oluşturulur. */
  create: boolean;
  /** Şifre hash'i yazılır mı: yeni hesapta her zaman, mevcutta yalnız bayrakla. */
  writePassword: boolean;
  /**
   * Mevcut hesapta bayrakların (doğrulanmış, yasaksız, personel satırı) veriyle
   * yeniden eşitlenmesi. Üyelerde kapalı: kimlik/onay diyaloglarını geçmiş
   * gerçek bir kişinin hesabı yeniden koşuda bozulmaz.
   */
  reconcileFlags: boolean;
}

export function planUatAccountSync(input: {
  kind: UatAccountKind;
  exists: boolean;
  resetPasswords: boolean;
}): UatSyncPlan {
  return {
    create: !input.exists,
    writePassword: !input.exists || input.resetPasswords,
    reconcileFlags: input.exists && input.kind === "staff",
  };
}

function parseAccountBase(
  entry: unknown,
  where: string,
  seen: Set<string>,
): UatMember {
  if (!isRecord(entry)) throw new Error(`${where}: expected an object`);
  const email =
    typeof entry.email === "string" ? entry.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error(`${where}: invalid email`);
  }
  if (email === PLATFORM_EMAIL) {
    throw new Error(`${where}: the platform service account cannot be seeded`);
  }
  if (seen.has(email)) {
    // Üye ve personel listeleri arasındaki çakışma da burada yakalanır: aynı
    // adres hem müşteri hem personel olamaz.
    throw new Error(`${where}: duplicate email ${email}`);
  }
  seen.add(email);
  const displayName =
    typeof entry.displayName === "string" && entry.displayName.trim()
      ? entry.displayName.trim()
      : email.split("@")[0];
  return { email, displayName };
}

/** `data/uat/accounts.json` içeriğini doğrular ve normalleştirir. */
export function parseUatAccounts(raw: unknown): UatAccounts {
  if (!isRecord(raw)) throw new Error("accounts.json: expected an object");
  const { members, staff } = raw;
  if (!Array.isArray(members) || !Array.isArray(staff)) {
    throw new Error('accounts.json: "members" and "staff" must be arrays');
  }
  const seen = new Set<string>();
  const parsedMembers = members.map((entry, index) =>
    parseAccountBase(entry, `members[${index}]`, seen),
  );
  const parsedStaff = staff.map((entry, index) => {
    const where = `staff[${index}]`;
    const base = parseAccountBase(entry, where, seen);
    const role = (entry as Record<string, unknown>).role;
    if (
      typeof role !== "string" ||
      !(Object.values(AdminRole) as string[]).includes(role)
    ) {
      throw new Error(`${where}: unknown admin role`);
    }
    return { ...base, role: role as AdminRole };
  });
  return { members: parsedMembers, staff: parsedStaff };
}

/**
 * `data/uat/listings.json` doğrulaması. Başlangıç ilanları yalnız tanımlı
 * üyelere aittir, ACTIVE ve `kind=listing` olmalıdır; görsel tabanı verilmişse
 * slug `seed-media.ts`in eşleme kuralına (`<taban>-<n>`) uymalıdır — aksi halde
 * görsel adımı ilanı sessizce atlar.
 */
export function parseUatListings(
  raw: unknown,
  memberEmails: readonly string[],
): UatListing[] {
  if (!Array.isArray(raw)) throw new Error("listings.json: expected an array");
  const members = new Set(memberEmails);
  const slugs = new Set<string>();
  return raw.map((entry, index) => {
    const where = `listings[${index}]`;
    if (!isRecord(entry)) throw new Error(`${where}: expected an object`);
    const ownerEmail =
      typeof entry.ownerEmail === "string"
        ? entry.ownerEmail.trim().toLowerCase()
        : "";
    if (!members.has(ownerEmail)) {
      throw new Error(`${where}: ownerEmail is not a seeded member`);
    }
    const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    if (!slug) throw new Error(`${where}: slug is required`);
    if (slugs.has(slug)) throw new Error(`${where}: duplicate slug ${slug}`);
    slugs.add(slug);
    if (entry.status !== "active" || entry.kind !== "listing") {
      throw new Error(`${where}: starter listings must be active listings`);
    }
    const base = entry.imageAssetBase;
    if (base !== undefined) {
      if (
        typeof base !== "string" ||
        resolveSeedProductAssetBase(slug, [base]) !== base
      ) {
        throw new Error(
          `${where}: slug must match "<imageAssetBase>-<n>" for the image step to pick it up`,
        );
      }
    }
    return { ...entry, ownerEmail, slug } as UatListing;
  });
}
