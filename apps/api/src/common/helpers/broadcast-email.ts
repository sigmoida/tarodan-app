/**
 * Admin duyuru e-postasının TEK üretim noktası: gönderim (EventService) ve
 * önizleme (admin ucu) aynı fonksiyonu çağırır, böylece önizleme gerçekte
 * gidenin birebir aynısıdır.
 */
import type { MailingType } from "@tarodan/types";
import {
  escapeEmailHtml,
  wrapEmailTemplateLayout,
} from "./email-template-renderer";
import { sanitizeEmailHtml } from "./email-html-sanitizer";
import { frontendUrl } from "../../config/app-urls";

export interface BroadcastEmailInput {
  /** Push başlığı; e-posta konusu verilmediyse konu olarak da kullanılır. */
  title: string;
  /** Push metni; HTML verilmediyse eski düz metin e-postanın gövdesidir. */
  body: string;
  /** E-postaya özel konu (opsiyonel). */
  emailSubject?: string | null;
  /** E-postaya özel HTML gövde (opsiyonel); render öncesi süzülür. */
  emailHtml?: string | null;
  to: string;
  /** Pazarlama gönderimlerinde alıcıya özel abonelikten çıkış linki. */
  unsubscribeUrl?: string;
}

export interface BroadcastEmail {
  subject: string;
  html: string;
}

/** Abonelikten çıkış linki — pazarlama zamanlayıcısıyla aynı rota. */
export function newsletterUnsubscribeUrl(token: string): string {
  const base = frontendUrl().replace(/\/+$/, "");
  return `${base}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function buildBroadcastEmail(input: BroadcastEmailInput): BroadcastEmail {
  const subject = input.emailSubject?.trim() || input.title;
  const customHtml = input.emailHtml?.trim()
    ? sanitizeEmailHtml(input.emailHtml)
    : "";

  // HTML yoksa eski yol: push metni kaçışlanıp sabit başlık + paragraf olur.
  const content = customHtml
    ? customHtml
    : `
                <h2 style="font-size: 24px; line-height: 1.3; color: #27272a; margin: 0 0 18px;">${escapeEmailHtml(input.title)}</h2>
                <p style="font-size: 15px; line-height: 1.7; color: #52525b; margin: 0;">${escapeEmailHtml(input.body).replace(/\n/g, "<br>")}</p>
              `;

  return {
    subject,
    html: wrapEmailTemplateLayout(
      content,
      subject,
      { to: input.to },
      input.unsubscribeUrl ? { unsubscribeUrl: input.unsubscribeUrl } : undefined,
    ),
  };
}

/** Pazarlama e-postası mı? (`undefined` eski çağıranlar = duyuru). */
export function isMarketingMailing(type: MailingType | undefined): boolean {
  return type === "marketing";
}
