import { defaultLocale } from "@tarodan/i18n";
import type {
  MailAreaId,
  MailDeliveryMode,
  MailInternalEventId,
} from "@tarodan/types";
import {
  escapeEmailHtml,
  wrapEmailTemplateLayout,
} from "../../../common/helpers/email-template-renderer";
import { translateMessage } from "../../i18n/translate";
import type {
  MailInternalNoticePayload,
  MailNoticeFact,
} from "./mail-internal-notice.types";

/**
 * Personel e-postalarının metni. Tamamı katalogdan (`server.mailRouting.
 * internal.*`), personel dili Türkçe (varsayılan yerel). Saf fonksiyonlar:
 * anlık gönderim ve özet işi aynı parçaları kullanır.
 */

export interface MailInternalRenderContext {
  /** Admin panelinin taban adresi (`adminUrl()`), sonda eğik çizgi yok. */
  adminBaseUrl: string;
  /** Marka düzeni (logo, alt bilgi) için vitrin adresi. */
  frontendUrl: string;
  /** Alt bilgideki "bu e-posta … gönderilmiştir" metni. */
  to: string;
}

export interface RenderedMail {
  subject: string;
  html: string;
}

const t = (key: string, values?: Record<string, string | number>) =>
  translateMessage(key, defaultLocale, values);

/** "order.paid" → katalog alt anahtarı "order_paid". */
export function mailEventCatalogKey(eventId: MailInternalEventId): string {
  return eventId.replace(/\./g, "_");
}

const eventText = (eventId: MailInternalEventId, part: "subject" | "title") =>
  `server.mailRouting.internal.events.${mailEventCatalogKey(eventId)}.${part}`;

/** Başlık satırında satır sonu kalmaz (iş numarası dışarıdan gelir). */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

function factValue(f: MailNoticeFact): string {
  return "valueKey" in f ? t(f.valueKey) : f.value;
}

function adminLink(ctx: MailInternalRenderContext, path: string): string {
  return `${ctx.adminBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

const occurredFormat = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  dateStyle: "short",
  timeStyle: "short",
});

function noticeBlock(
  eventId: MailInternalEventId,
  notice: MailInternalNoticePayload,
  ctx: MailInternalRenderContext,
  occurredAt?: Date,
): string {
  const rows = notice.facts
    .map(
      (f) => `
        <tr>
          <td style="padding: 4px 12px 4px 0; color: #71717a; font-size: 13px; white-space: nowrap; vertical-align: top;">${escapeEmailHtml(t(`server.mailRouting.internal.facts.${f.label}`))}</td>
          <td style="padding: 4px 0; color: #27272a; font-size: 14px;">${escapeEmailHtml(factValue(f))}</td>
        </tr>`,
    )
    .join("");
  const items = (notice.items ?? [])
    .map((item) => {
      const ref = escapeEmailHtml(item.ref);
      const label = item.adminPath
        ? `<a href="${escapeEmailHtml(adminLink(ctx, item.adminPath))}" style="color: #d95700; text-decoration: none;">${ref}</a>`
        : ref;
      return `<li style="margin: 0 0 4px;">${label} — ${escapeEmailHtml(item.text)}</li>`;
    })
    .join("");
  const when = occurredAt
    ? `<p style="margin: 0 0 8px; color: #a1a1aa; font-size: 12px;">${escapeEmailHtml(occurredFormat.format(occurredAt))}</p>`
    : "";
  return `
    <h3 style="font-size: 16px; color: #27272a; margin: 0 0 6px;">${escapeEmailHtml(t(eventText(eventId, "title")))} · ${escapeEmailHtml(notice.ref)}</h3>
    ${when}
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 10px;">${rows}</table>
    ${items ? `<ul style="margin: 0 0 10px; padding-left: 18px; font-size: 13px; color: #3f3f46;">${items}</ul>` : ""}
    <p style="margin: 0 0 20px;"><a href="${escapeEmailHtml(adminLink(ctx, notice.adminPath))}" style="color: #d95700; font-weight: bold; text-decoration: none;">${escapeEmailHtml(t("server.mailRouting.internal.openInAdmin"))}</a></p>`;
}

function footer(): string {
  return `<p style="margin: 12px 0 0; color: #a1a1aa; font-size: 12px;">${escapeEmailHtml(t("server.mailRouting.internal.footer"))}</p>`;
}

/** Tek olay → tek e-posta (teslim `instant`). */
export function renderInternalNotice(
  eventId: MailInternalEventId,
  notice: MailInternalNoticePayload,
  ctx: MailInternalRenderContext,
): RenderedMail {
  const subject = oneLine(
    t(eventText(eventId, "subject"), { ref: notice.ref }),
  );
  const html = wrapEmailTemplateLayout(
    `${noticeBlock(eventId, notice, ctx)}${footer()}`,
    subject,
    { to: ctx.to },
    ctx.frontendUrl,
  );
  return { subject, html };
}

/** Bir alanın birikmiş olayları → TEK özet e-postası (`hourly` / `daily`). */
export function renderInternalDigest(
  area: MailAreaId,
  delivery: Exclude<MailDeliveryMode, "instant">,
  notices: ReadonlyArray<{
    eventId: MailInternalEventId;
    notice: MailInternalNoticePayload;
    occurredAt: Date;
  }>,
  ctx: MailInternalRenderContext,
): RenderedMail {
  const subject = oneLine(
    t("server.mailRouting.internal.digest.subject", {
      area: t(`server.mailRouting.internal.areas.${area}`),
      period: t(`server.mailRouting.internal.digest.${delivery}`),
      count: notices.length,
    }),
  );
  const intro = `<h2 style="font-size: 20px; color: #27272a; margin: 0 0 18px;">${escapeEmailHtml(subject)}</h2>`;
  const blocks = notices
    .map(({ eventId, notice, occurredAt }) =>
      noticeBlock(eventId, notice, ctx, occurredAt),
    )
    .join(
      `<hr style="border: 0; border-top: 1px solid #ededee; margin: 0 0 18px;" />`,
    );
  const html = wrapEmailTemplateLayout(
    `${intro}${blocks}${footer()}`,
    subject,
    { to: ctx.to },
    ctx.frontendUrl,
  );
  return { subject, html };
}

/** Admin "Test gönder" e-postası. */
export function renderAccountTestMail(
  address: string,
  ctx: Pick<MailInternalRenderContext, "frontendUrl" | "to">,
): RenderedMail {
  const subject = oneLine(t("server.mailRouting.testMail.subject"));
  const body = escapeEmailHtml(
    t("server.mailRouting.testMail.body", { address }),
  );
  const html = wrapEmailTemplateLayout(
    `<h2 style="font-size: 20px; color: #27272a; margin: 0 0 18px;">${escapeEmailHtml(subject)}</h2><p style="font-size: 15px; line-height: 1.7; color: #52525b; margin: 0;">${body}</p>`,
    subject,
    { to: ctx.to },
    ctx.frontendUrl,
  );
  return { subject, html };
}
