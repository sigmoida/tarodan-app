/** @format */

import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

export interface MessageThread {
  id: string;
  otherUser: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  lastMessage?: {
    content: string;
    createdAt: string;
    isFromMe: boolean;
  };
  unreadCount: number;
  product?: {
    id: string;
    title: string;
    imageUrl?: string;
  };
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  status: "sent" | "delivered" | "read" | "pending" | "rejected";
  readAt?: string | null;
  isFiltered?: boolean;
  filterReason?: string;
}

// Client-side content filter patterns (basic check).
const PROHIBITED_PATTERNS = [
  /\b(banka|hesap|iban)\b.*\b(numar|no)\b/gi,
  /\b(telefon|tel|gsm)\b.*\b(\d{10,})\b/gi,
  /\b(e[-]?posta|mail|email)\b.*@/gi,
  /\b(whatsapp|wp|telegram)\b/gi,
];

const IMG_PATTERN = /\[IMG:(https?:\/\/[^\]]+)\]/g;

/** Split a message into ordered text/image parts (`[IMG:url]` markers). */
export function parseMessageContent(
  content: string,
): Array<{ type: "text" | "image"; value: string }> {
  if (!content) return [];
  const parts: Array<{ type: "text" | "image"; value: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  IMG_PATTERN.lastIndex = 0;
  while ((m = IMG_PATTERN.exec(content)) !== null) {
    if (m.index > lastIndex) {
      const text = content.slice(lastIndex, m.index).trim();
      if (text) parts.push({ type: "text", value: text });
    }
    parts.push({ type: "image", value: m[1] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) parts.push({ type: "text", value: text });
  }
  return parts.length ? parts : [{ type: "text", value: content }];
}

/**
 * Thread-list preview: shows "📷 Photo" for image messages instead of the raw
 * link, even when the content filter has mangled the presigned URL inside
 * `[IMG:...]` (leftover X-Amz / %2F / http fragments).
 */
export function getThreadPreview(content: string, locale: string): string {
  if (!content) return "";
  const t = createTranslator({
    locale,
    messages: getMessages(resolveLocale(locale)),
  });
  const photoLabel = t("message.photoLabel");
  let hadImage = /\[IMG:/i.test(content);
  let text = content.replace(/\[IMG:[^\]]*\]/gi, "").trim();
  const urlLike = /(https?:\/\/|www\.|amazonaws|x-amz-|%2[fF]|\.s3\.)/i;
  if (urlLike.test(text)) {
    hadImage = true;
    text = text
      .replace(
        /\S*(?:https?:\/\/|www\.|amazonaws|x-amz-|%2[fF]|\.s3\.)\S*/gi,
        "",
      )
      .trim();
  }
  if (hadImage && urlLike.test(text)) text = "";
  if (hadImage) return text ? `📷 ${text}` : photoLabel;
  return text;
}

export const checkContentFilter = (
  text: string,
  locale: string,
): { passed: boolean; warning?: string } => {
  const lowerText = text.toLowerCase();
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(lowerText)) {
      pattern.lastIndex = 0;
      return {
        passed: false,
        warning:
          locale === "en"
            ? "Personal contact information detected in your message. Communication outside the platform is not recommended for your safety."
            : "Mesajınızda kişisel iletişim bilgisi tespit edildi. Platform dışı iletişim güvenliğiniz için önerilmez.",
      };
    }
    pattern.lastIndex = 0;
  }
  return { passed: true };
};
