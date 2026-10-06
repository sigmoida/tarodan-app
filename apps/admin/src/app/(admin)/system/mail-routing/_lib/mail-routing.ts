import { z } from "zod";
import type { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import {
  MAIL_DELIVERY_MODES,
  MAIL_DISPLAY_NAME_MAX_LENGTH,
  MAIL_INTERNAL_RECIPIENTS_MAX,
  isValidMailDisplayName,
} from "@tarodan/types";
import type {
  MailAreaId,
  MailAreaState,
  MailAreaUpdate,
  MailDeliveryMode,
  MailInternalEventId,
  MailInternalEventState,
  MailRoutingState,
  MailSenderAccountInput,
  MailSenderAccountPatch,
  MailSenderAccountView,
} from "@/lib/api/mail-routing.types";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * E-posta Yönlendirme ekranının saf mantığı: fark çıkarma (yalnız DEĞİŞEN
 * kayıtlar gider), kişi bazlı görünüm, doğrulama şemaları ve etiket
 * yardımcıları. Sözleşme `@tarodan/types` (mail-routing) — sunucu aynı
 * kuralları (geçerli adres, küçük harf, alan başına en çok 20 alıcı, tekrar
 * yok) yeniden uygular.
 */

/** Gönderen seçicisinde "hesap yok, varsayılan kimlik" seçeneğinin değeri. */
export const DEFAULT_SENDER_VALUE = "";

const EMAIL = z.string().email();

/** Adres karşılaştırması küçük harfe göre; sunucu da küçük harfle saklar. */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export const isValidEmail = (raw: string): boolean =>
  EMAIL.safeParse(normalizeEmail(raw)).success;

/** API yanıtını (zarflı ya da düz) durum nesnesine çevirir. */
export function readMailRoutingState(
  raw: unknown,
): MailRoutingState | undefined {
  const body = raw as
    | (Partial<MailRoutingState> & { data?: Partial<MailRoutingState> })
    | undefined;
  const state = body?.data?.areas ? body.data : body;
  return state?.areas && state.accounts
    ? (state as MailRoutingState)
    : undefined;
}

// ── Etiketler ────────────────────────────────────────────────────────────

export const areaLabel = (t: T, id: MailAreaId): string =>
  t(`admin.mailRouting.areas.${id}`);

/** Olay kimliği nokta içerir (`order.paid`); katalog anahtarı alt çizgi kullanır. */
export const eventKey = (id: MailInternalEventId): string =>
  id.replace(".", "_");

export const eventLabel = (t: T, id: MailInternalEventId): string =>
  t(`admin.mailRouting.events.${eventKey(id)}` as MessageKey);

export const deliveryOptions = (t: T) =>
  MAIL_DELIVERY_MODES.map((mode) => ({
    value: mode,
    label: t(`admin.mailRouting.delivery.${mode}`),
  }));

/** "Varsayılan kimlik" + hesaplar; alan eşlemesi seçicisi. */
export function senderOptions(
  t: T,
  accounts: readonly MailSenderAccountView[],
) {
  return [
    {
      value: DEFAULT_SENDER_VALUE,
      label: t("admin.mailRouting.areasTab.defaultSender"),
    },
    ...accounts.map((account) => ({
      value: account.id,
      label: account.address,
    })),
  ];
}

/** Hesabın son test sonucu: hiç denenmediyse null. */
export function testStatus(
  account: Pick<MailSenderAccountView, "lastTestOk">,
): "ok" | "failed" | null {
  if (account.lastTestOk === null) return null;
  return account.lastTestOk ? "ok" : "failed";
}

// ── Gönderen hesap formu ─────────────────────────────────────────────────

export interface AccountFormValues {
  address: string;
  displayName: string;
  username: string;
  password: string;
  host: string;
  port: string;
  /** "" = varsayılan sunucu ayarı, "true" / "false" = açık seçim. */
  secure: string;
}

export function accountSchema(t: T, isEdit: boolean) {
  return z.object({
    address: z
      .string()
      .trim()
      .min(1, t("admin.mailRouting.validation.required"))
      .refine(isValidEmail, t("admin.mailRouting.validation.email")),
    displayName: z
      .string()
      .trim()
      .min(1, t("admin.mailRouting.validation.required"))
      .refine(isValidMailDisplayName, t("admin.mailRouting.validation.displayName", {
          max: MAIL_DISPLAY_NAME_MAX_LENGTH,
        })),
    username: z.string().trim().max(200),
    password: isEdit
      ? z.string().max(500)
      : z
          .string()
          .min(1, t("admin.mailRouting.validation.passwordRequired"))
          .max(500),
    host: z.string().trim().max(200),
    port: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535),
        t("admin.mailRouting.validation.port"),
      ),
    secure: z.enum(["", "true", "false"]),
  });
}

export const emptyAccountValues: AccountFormValues = {
  address: "",
  displayName: "",
  username: "",
  password: "",
  host: "",
  port: "",
  secure: "",
};

/** Kayıtlı hesap → form değerleri. Parola ASLA doldurulmaz. */
export function accountToFormValues(
  account: MailSenderAccountView,
): AccountFormValues {
  return {
    address: account.address,
    displayName: account.displayName,
    // Varsayılan (= adres) kullanıcı adı boş gösterilir: adres değişince sunucu
    // onu da adrese taşır; yalnız özel bir kullanıcı adı alana yazılır.
    username: account.username === account.address ? "" : account.username,
    password: "",
    host: account.host ?? "",
    port: account.port == null ? "" : String(account.port),
    secure: account.secure == null ? "" : String(account.secure),
  };
}

const parseSecure = (value: string): boolean | null =>
  value === "" ? null : value === "true";

/** Yeni hesap gövdesi: boş gelişmiş alanlar `null` (= varsayılan sunucu). */
export function accountCreatePayload(
  values: AccountFormValues,
): MailSenderAccountInput {
  const username = values.username.trim();
  return {
    address: normalizeEmail(values.address),
    displayName: values.displayName.trim(),
    host: values.host.trim() || null,
    port: values.port.trim() ? Number(values.port) : null,
    secure: parseSecure(values.secure),
    username: username || null,
    password: values.password,
  };
}

/**
 * Düzenleme gövdesi: yalnız DEĞİŞEN alanlar. Parola alanı boşsa saklı parola
 * korunur (gövdede `password` hiç yoktur). Hiçbir şey değişmediyse `null`.
 */
export function accountPatchPayload(
  values: AccountFormValues,
  original: MailSenderAccountView,
): MailSenderAccountPatch | null {
  const next = accountCreatePayload(values);
  const patch: MailSenderAccountPatch = {};

  if (next.address !== original.address) patch.address = next.address;
  if (next.displayName !== original.displayName) {
    patch.displayName = next.displayName;
  }
  if (next.host !== original.host) patch.host = next.host;
  if (next.port !== original.port) patch.port = next.port;
  if (next.secure !== original.secure) patch.secure = next.secure;
  // Boş alan "adres kullan" demektir. Varsayılan kullanıcı adı gönderilmez
  // (adres değişirse sunucu onu da taşır); yalnız farklı yazılan ya da özel
  // kullanıcı adını sıfırlayan değer gider.
  const defaultUsername = original.username === original.address;
  if (next.username === null) {
    if (!defaultUsername) patch.username = null;
  } else if (next.username !== original.username) {
    patch.username = next.username;
  }
  if (values.password !== "") patch.password = values.password;

  return Object.keys(patch).length > 0 ? patch : null;
}

/** "Test gönder" alıcısı: tek, geçerli bir adres. */
export const testSendSchema = (t: T) =>
  z.object({
    to: z
      .string()
      .trim()
      .min(1, t("admin.mailRouting.validation.required"))
      .refine(isValidEmail, t("admin.mailRouting.validation.email")),
  });

// ── Alan (gönderen eşlemesi) formu ───────────────────────────────────────

export interface AreaFormValues {
  senderAccountId: string;
  displayName: string;
  replyTo: string;
}

export function areaSchema(t: T) {
  return z.object({
    senderAccountId: z.string(),
    displayName: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || isValidMailDisplayName(value),
        t("admin.mailRouting.validation.displayName", {
          max: MAIL_DISPLAY_NAME_MAX_LENGTH,
        }),
      ),
    replyTo: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || isValidEmail(value),
        t("admin.mailRouting.validation.email"),
      ),
  });
}

export const areaToFormValues = (area: MailAreaState): AreaFormValues => ({
  senderAccountId: area.senderAccountId ?? DEFAULT_SENDER_VALUE,
  displayName: area.displayName ?? "",
  replyTo: area.replyTo ?? "",
});

/** Yalnız değişen alanlar; hiçbiri değişmediyse `null`. */
export function areaSenderUpdate(
  values: AreaFormValues,
  area: MailAreaState,
): MailAreaUpdate | null {
  const update: MailAreaUpdate = {};
  const senderAccountId = values.senderAccountId || null;
  const displayName = values.displayName.trim() || null;
  const replyTo = values.replyTo.trim() ? normalizeEmail(values.replyTo) : null;

  if (senderAccountId !== area.senderAccountId) {
    update.senderAccountId = senderAccountId;
  }
  if (displayName !== area.displayName) update.displayName = displayName;
  if (replyTo !== area.replyTo) update.replyTo = replyTo;

  return Object.keys(update).length > 0 ? update : null;
}

// ── İç bildirimler ───────────────────────────────────────────────────────

/** Bildirim sekmesinde listelenen alanlar: olayı olmayanlar alıcı almaz. */
export const notifiableAreas = (
  areas: readonly MailAreaState[],
): MailAreaState[] => areas.filter((area) => area.events.length > 0);

export type AddRecipientResult =
  | { ok: true; list: string[] }
  | { ok: false; error: "invalid" | "duplicate" | "limit" };

/** Alıcı listesine adres ekler: geçerli, küçük harf, tekrarsız, en çok 20. */
export function addRecipient(
  list: readonly string[],
  raw: string,
): AddRecipientResult {
  const address = normalizeEmail(raw);
  if (!isValidEmail(address)) return { ok: false, error: "invalid" };
  if (list.includes(address)) return { ok: false, error: "duplicate" };
  if (list.length >= MAIL_INTERNAL_RECIPIENTS_MAX) return { ok: false, error: "limit" };
  return { ok: true, list: [...list, address] };
}

export const removeRecipient = (
  list: readonly string[],
  address: string,
): string[] => list.filter((item) => item !== address);

/** Bir alanın düzenlenebilir bildirim taslağı. */
export interface NotificationDraft {
  internalRecipients: string[];
  events: MailInternalEventState[];
}

export const toNotificationDraft = (
  area: Pick<MailAreaState, "internalRecipients" | "events">,
): NotificationDraft => ({
  internalRecipients: [...area.internalRecipients],
  events: area.events.map((event) => ({ ...event })),
});

export function setEventEnabled(
  draft: NotificationDraft,
  id: MailInternalEventId,
  enabled: boolean,
): NotificationDraft {
  return {
    ...draft,
    events: draft.events.map((event) =>
      event.id === id ? { ...event, enabled } : event,
    ),
  };
}

export function setEventDelivery(
  draft: NotificationDraft,
  id: MailInternalEventId,
  delivery: MailDeliveryMode,
): NotificationDraft {
  return {
    ...draft,
    events: draft.events.map((event) =>
      event.id === id ? { ...event, delivery } : event,
    ),
  };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item));

/**
 * Taslak ile kayıtlı alan arasındaki fark: yalnız DEĞİŞEN alıcı listesi ve
 * YALNIZ değişen olaylar. Fark yoksa `null` (kaydet düğmesi kapalı kalır).
 */
export function notificationUpdate(
  draft: NotificationDraft,
  area: Pick<MailAreaState, "internalRecipients" | "events">,
): MailAreaUpdate | null {
  const update: MailAreaUpdate = {};

  if (!sameSet(draft.internalRecipients, area.internalRecipients)) {
    update.internalRecipients = draft.internalRecipients;
  }
  const events = draft.events.filter((event) => {
    const saved = area.events.find((item) => item.id === event.id);
    return (
      !saved ||
      saved.enabled !== event.enabled ||
      saved.delivery !== event.delivery
    );
  });
  if (events.length > 0) update.events = events;

  return Object.keys(update).length > 0 ? update : null;
}

// ── Kişiye göre görünüm ──────────────────────────────────────────────────

export interface PersonRow {
  address: string;
  areaIds: MailAreaId[];
}

/**
 * Her tekil alıcı adresi ve onu alan alanlar (alan sırası korunur, adresler
 * alfabetik). Yalnız bildirimi olan alanlar sayılır.
 */
export function recipientsByPerson(
  areas: readonly MailAreaState[],
): PersonRow[] {
  const byAddress = new Map<string, MailAreaId[]>();
  for (const area of notifiableAreas(areas)) {
    for (const address of area.internalRecipients) {
      byAddress.set(address, [...(byAddress.get(address) ?? []), area.id]);
    }
  }
  return [...byAddress.entries()]
    .map(([address, areaIds]) => ({ address, areaIds }))
    .sort((a, b) => a.address.localeCompare(b.address));
}

export interface PersonChangePlan {
  /** Alan başına bir PATCH: yalnız o kişinin eklendiği/çıkarıldığı alanlar. */
  updates: Array<{ areaId: MailAreaId; update: MailAreaUpdate }>;
  /** Kişi eklenecek ama listesi 20'ye dolu olan alanlar (plana girmez). */
  overLimit: MailAreaId[];
}

/**
 * Bir kişiyi seçilen alanlara taşır: seçilip henüz listede olmayan alanlara
 * eklenir, seçilmeyip listede olan alanlardan çıkarılır; değişmeyen alan için
 * istek üretilmez. Dolu alanlar `overLimit`'te bildirilir (sunucu 400 verirdi).
 */
export function planPersonChange(
  areas: readonly MailAreaState[],
  rawAddress: string,
  selected: readonly MailAreaId[],
): PersonChangePlan {
  const address = normalizeEmail(rawAddress);
  const plan: PersonChangePlan = { updates: [], overLimit: [] };

  for (const area of notifiableAreas(areas)) {
    const has = area.internalRecipients.includes(address);
    const wants = selected.includes(area.id);
    if (has === wants) continue;
    if (wants && area.internalRecipients.length >= MAIL_INTERNAL_RECIPIENTS_MAX) {
      plan.overLimit.push(area.id);
      continue;
    }
    plan.updates.push({
      areaId: area.id,
      update: {
        internalRecipients: wants
          ? [...area.internalRecipients, address]
          : removeRecipient(area.internalRecipients, address),
      },
    });
  }
  return plan;
}

// ── Kişi formu ───────────────────────────────────────────────────────────

/** Kişi formunda her alanın onay kutusu `area_<id>` adını taşır. */
export const personAreaField = (id: MailAreaId): string => `area_${id}`;

export type PersonFormValues = Record<string, string | boolean>;

export function personSchema(t: T, areas: readonly MailAreaState[]) {
  const shape: Record<string, z.ZodTypeAny> = {
    address: z
      .string()
      .trim()
      .min(1, t("admin.mailRouting.validation.required"))
      .refine(isValidEmail, t("admin.mailRouting.validation.email")),
  };
  for (const area of notifiableAreas(areas)) {
    shape[personAreaField(area.id)] = z.boolean();
  }
  return z.object(shape);
}

export function personToFormValues(
  areas: readonly MailAreaState[],
  person?: PersonRow,
): PersonFormValues {
  const values: PersonFormValues = { address: person?.address ?? "" };
  for (const area of notifiableAreas(areas)) {
    values[personAreaField(area.id)] =
      person?.areaIds.includes(area.id) ?? false;
  }
  return values;
}

export function selectedAreaIds(
  values: PersonFormValues,
  areas: readonly MailAreaState[],
): MailAreaId[] {
  return notifiableAreas(areas)
    .filter((area) => values[personAreaField(area.id)] === true)
    .map((area) => area.id);
}
