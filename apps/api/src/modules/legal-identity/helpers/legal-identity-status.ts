import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  LEGAL_IDENTITY_FIELDS,
  isValidTckn,
  maskTckn,
  missingLegalIdentityFields,
  normalizeLegalName,
  normalizeTckn,
  type LegalIdentityField,
  type LegalIdentityStatus,
  type LegalIdentityValues,
  type SubmitLegalIdentityRequest,
} from "@tarodan/types";
import { i18nMessage } from "../../i18n";

/**
 * Yasal kimlik kapısının saf kuralları — sunucu "kim, hangi alanları eksik"
 * sorusunu YALNIZ burada cevaplar; web kapısı, mobil ve admin "kimlik eksik"
 * filtresi aynı kuralı okur.
 */

/** Kapı hesabı için gereken alanlar (`LegalIdentitySubject` ile birebir). */
export const LEGAL_IDENTITY_SUBJECT_SELECT = {
  legalFirstName: true,
  legalLastName: true,
  nationalId: true,
  isTestAccount: true,
  // Personel hesabı = AdminUser satırı olan hesap (rol / aktiflik fark etmez).
  adminUser: { select: { id: true } },
} satisfies Prisma.UserSelect;

export interface LegalIdentitySubject extends LegalIdentityValues {
  isTestAccount: boolean;
  adminUser: { id: string } | null;
}

/**
 * Muaf hesaplar: personel (yönetim paneli hesabı) ve canlı test şeridi
 * (App Review / QA). Başka muafiyet YOK — onaylı kurumsal satıcı dahil her
 * üye kimlik verir.
 */
export function isLegalIdentityExempt(subject: {
  isTestAccount: boolean;
  /** AdminUser satırı (hangi alanları seçildiği önemsiz) ya da null. */
  adminUser: object | null;
}): boolean {
  return subject.isTestAccount === true || Boolean(subject.adminUser);
}

/**
 * Üyenin kapı durumu. `bankTckn` üyenin KENDİ banka hesabındaki TCKN'dir;
 * yalnız TCKN eksikken ve geçerliyse ön doldurma olarak önerilir. Ad için
 * ön doldurma YOK: görünen ad takma ad olabilir, tahmin edilmez.
 */
export function buildLegalIdentityStatus(
  subject: LegalIdentitySubject,
  bankTckn: string | null = null,
): LegalIdentityStatus {
  const exempt = isLegalIdentityExempt(subject);
  const missing = exempt ? [] : missingLegalIdentityFields(subject);
  const suggestion =
    !subject.nationalId && bankTckn && isValidTckn(bankTckn)
      ? normalizeTckn(bankTckn)
      : null;
  return {
    required: !exempt,
    missing,
    legalFirstName: subject.legalFirstName,
    legalLastName: subject.legalLastName,
    nationalIdMasked: maskTckn(subject.nationalId),
    suggestedNationalId: suggestion,
  };
}

/** Dolu metin mi — `null`, boş ve yalnız boşluk "gönderilmedi" sayılır. */
const provided = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/**
 * Gelen alanların normalize hâli; gönderilmeyen (ya da boş / null gelen) alan
 * çıktıda YOKTUR — böylece hiçbir yol bir alana boş metin yazamaz.
 */
export function normalizeLegalIdentityInput(
  input: SubmitLegalIdentityRequest,
): Partial<LegalIdentityValues> {
  const out: Partial<LegalIdentityValues> = {};
  for (const field of LEGAL_IDENTITY_FIELDS) {
    const raw = input[field];
    if (!provided(raw)) continue;
    const value =
      field === "nationalId" ? normalizeTckn(raw) : normalizeLegalName(raw);
    // Rakamsız bir "TCKN" boşa iner; boş metin hiçbir yolda yazılmaz.
    if (value) out[field] = value;
  }
  return out;
}

/** Yazılacak değişiklik: yalnız gerçekten değişen alanlar. */
export interface LegalIdentityChange {
  data: Partial<LegalIdentityValues>;
  changed: LegalIdentityField[];
  before: LegalIdentityValues;
  after: LegalIdentityValues;
}

function diff(
  current: LegalIdentityValues,
  input: Partial<LegalIdentityValues>,
): LegalIdentityChange {
  const data: Partial<LegalIdentityValues> = {};
  const changed: LegalIdentityField[] = [];
  for (const field of LEGAL_IDENTITY_FIELDS) {
    const value = input[field];
    // Boş değer hiçbir yolda yazılmaz (alan silinemez).
    if (!value || value === current[field]) continue;
    data[field] = value;
    changed.push(field);
  }
  return {
    data,
    changed,
    before: { ...current },
    after: { ...current, ...data },
  };
}

/**
 * ÜYENİN gönderimi: dolu bir alan DEĞİŞTİRİLEMEZ (aynı değeri yeniden göndermek
 * zararsız), boş alanlar doldurulur ve sonuçta üç alan da dolu olmalıdır.
 * Düzeltme yalnız admin üzerinden (gerekçe + denetim kaydı).
 */
export function planMemberSubmission(
  current: LegalIdentityValues,
  input: SubmitLegalIdentityRequest,
): LegalIdentityChange {
  const change = diff(current, normalizeLegalIdentityInput(input));
  if (change.changed.some((field) => current[field])) {
    throw legalIdentityLocked();
  }
  if (missingLegalIdentityFields(change.after).length > 0) {
    throw new BadRequestException(i18nMessage("server.identity.incomplete"));
  }
  return change;
}

/** Dolu bir alanı değiştirme girişimi (ya da eşzamanlı gönderimi kaybeden istek). */
export function legalIdentityLocked(): ConflictException {
  return new ConflictException(i18nMessage("server.identity.locked"));
}

/**
 * Üye yazımının koşulu: yazılacak alanlar HÂLÂ boş. "Bir kez girilir" kuralı
 * okuma-yazma arasında da geçerli kalsın diye yazım koşullu yapılır; aynı
 * anda gelen iki gönderimden ikincisi hiçbir satırı güncelleyemez.
 */
export function stillEmptyWhere(
  fields: readonly LegalIdentityField[],
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  for (const field of fields) where[field] = null;
  return where;
}

/**
 * Admin düzeltmesinin sunucu kuralı (yalnız arayüzde değil): silinmiş
 * (anonimleştirilmiş) hesaba kimlik yazılmaz — numarayı kişinin kendi yeni
 * hesabından kilitler ve arşivle çelişir; personel hesabı kimlikten muaftır.
 */
export function assertCorrectable(subject: {
  deletedAt: Date | null;
  adminUser: object | null;
}): void {
  if (subject.deletedAt || subject.adminUser) {
    throw new BadRequestException(
      i18nMessage("server.identity.correctionNotAllowed"),
    );
  }
}

/**
 * ADMİN düzeltmesi: dolu alan da değişebilir; en az bir alan gerçekten
 * değişmelidir (boş düzeltme denetim kaydını kirletir). Alan silinemez —
 * gönderilmeyen alan olduğu gibi kalır.
 */
export function planAdminCorrection(
  current: LegalIdentityValues,
  input: SubmitLegalIdentityRequest,
): LegalIdentityChange {
  const change = diff(current, normalizeLegalIdentityInput(input));
  if (change.changed.length === 0) {
    throw new BadRequestException(
      i18nMessage("server.identity.correctionNoChange"),
    );
  }
  return change;
}

/**
 * Denetim kaydına yazılabilir özet: hangi alanlar değişti + maskeli TCKN.
 * Ad ve TCKN DEĞER olarak yazılmaz (audit_logs purge edilmez; ikinci bir kalıcı
 * kimlik deposu olurdu). Önceki tam değer gerekiyorsa kaynak belge (nüfus
 * cüzdanı) gerekçede anılır.
 */
export function legalIdentityAuditSummary(change: LegalIdentityChange): {
  changedFields: LegalIdentityField[];
  nationalIdMaskedBefore: string | null;
  nationalIdMaskedAfter: string | null;
} {
  return {
    changedFields: change.changed,
    nationalIdMaskedBefore: maskTckn(change.before.nationalId),
    nationalIdMaskedAfter: maskTckn(change.after.nationalId),
  };
}

/**
 * Admin "kimlik eksik" filtresi — `buildLegalIdentityStatus`ın Prisma karşılığı:
 * muaf olmayan (personel değil, test değil) ve üç alandan biri boş hesap.
 * İki ifade aynı kuralın iki yazımıdır; spec ikisini birlikte sabitler.
 */
export function legalIdentityIncompleteWhere(): Prisma.UserWhereInput {
  return {
    isTestAccount: false,
    adminUser: null,
    OR: [
      { legalFirstName: null },
      { legalLastName: null },
      { nationalId: null },
    ],
  };
}

/**
 * TCKN tekilliği ihlali — numara başka bir hesapta. Yanıt O HESAP hakkında
 * hiçbir şey söylemez (e-posta, ad, durum yok): yalnız "bu numara
 * kullanılamıyor". Aynı istisna hem ön-kontrolde hem DB yarışında (P2002)
 * atılır ki iki yol ayırt edilemesin.
 */
export function nationalIdUnavailable(): ConflictException {
  return new ConflictException(
    i18nMessage("server.identity.nationalIdUnavailable"),
  );
}

/** P2002'nin hedefi `national_id` mi (Prisma meta hedefi dizi ya da metin). */
export function isNationalIdUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  const text = (
    Array.isArray(target) ? target.join(",") : String(target ?? "")
  ).toLowerCase();
  return text.includes("national_id") || text.includes("nationalid");
}

/** Yazım yarışında DB tekilliği patlarsa ön-kontrolle AYNI yanıtı ver. */
export function rethrowNationalIdConflict(error: unknown): never {
  if (isNationalIdUniqueViolation(error)) throw nationalIdUnavailable();
  throw error;
}

/**
 * Gönderim hız sınırları. Uç "bu TCKN kayıtlı mı" sorusunun kahinidir; tekillik
 * sorgusuna ulaşan her gönderim sayılır. Üye başına günlük tavan, kahini tek
 * hesapla taramayı; IP başına saatlik tavan, çok hesapla taramayı keser. IP
 * tavanı geniş tutuldu: mobil operatör NAT'ı arkasında çok üye aynı IP'yi
 * paylaşır ve kapı açıldığında herkes bir kez gönderecek.
 */
export const LEGAL_IDENTITY_SUBMIT_LIMITS = {
  perUser: { max: 10, windowSeconds: 24 * 60 * 60 },
  perIp: { max: 30, windowSeconds: 60 * 60 },
} as const;

export function legalIdentityRateLimitKeys(
  userId: string,
  ip: string | null,
): { user: string; ip: string | null } {
  return {
    user: `legal-identity:submit:user:${userId}`,
    ip: ip ? `legal-identity:submit:ip:${ip}` : null,
  };
}
