/**
 * Mesajlarda yasaklı içerik tespiti — doğrudan iletişim bilgisi paylaşımını engeller.
 * Web paritesi: banka hesabı, telefon, e-posta, WhatsApp, Instagram, Telegram.
 *
 * Amaç: Platform dışı iletişimi önleyerek alıcı/satıcı koruması.
 */

export type ContentViolationType =
  | 'phone'
  | 'email'
  | 'iban'
  | 'whatsapp'
  | 'telegram'
  | 'instagram'
  | 'external_link';

export interface ContentViolation {
  type: ContentViolationType;
  match: string;
  label: string;
}

const PATTERNS: Array<{ type: ContentViolationType; regex: RegExp; label: string }> = [
  // Türkiye telefon: 05XX XXX XX XX, +90 5XX..., 0090 5XX...
  {
    type: 'phone',
    regex: /(?:\+?90[\s.-]?|0)?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/g,
    label: 'Telefon numarası',
  },
  // Sabit hat + alan kodu ile bir dizi rakam
  {
    type: 'phone',
    regex: /\b0[2-4]\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g,
    label: 'Telefon numarası',
  },
  // E-posta
  {
    type: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    label: 'E-posta adresi',
  },
  // IBAN (TR ile başlayan + 24 rakam veya boşluklu versiyonu)
  {
    type: 'iban',
    regex: /\bTR[\s]?\d{2}(?:[\s]?\d{4}){5}(?:[\s]?\d{2})\b/gi,
    label: 'Banka hesabı (IBAN)',
  },
  // WhatsApp
  {
    type: 'whatsapp',
    regex: /\b(whats?app|wp|whatsap)\b/gi,
    label: 'WhatsApp',
  },
  // Telegram
  {
    type: 'telegram',
    regex: /\b(telegram|t\.me)\b/gi,
    label: 'Telegram',
  },
  // Instagram (@kullanici veya instagram.com)
  {
    type: 'instagram',
    regex: /\b(instagram|insta)\b|@[a-zA-Z0-9_.]{2,}/gi,
    label: 'Instagram / sosyal medya',
  },
  // Harici link (tarodan.com dışı URL)
  {
    type: 'external_link',
    regex: /\bhttps?:\/\/(?!(?:www\.)?tarodan\.com)\S+/gi,
    label: 'Harici bağlantı',
  },
];

export function detectViolations(text: string): ContentViolation[] {
  if (!text) return [];
  const found: ContentViolation[] = [];
  const seen = new Set<string>();
  for (const { type, regex, label } of PATTERNS) {
    const matches = text.match(regex);
    if (matches) {
      for (const match of matches) {
        const key = `${type}:${match.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({ type, match, label });
        }
      }
    }
  }
  return found;
}

export function hasContentViolation(text: string): boolean {
  return detectViolations(text).length > 0;
}

export function getViolationMessage(violations: ContentViolation[]): string {
  if (violations.length === 0) return '';
  const uniqueLabels = Array.from(new Set(violations.map(v => v.label)));
  return `Güvenliğiniz için bu mesaj gönderilemiyor. Tespit edilen: ${uniqueLabels.join(', ')}. Platform dışı iletişim ihlal olarak raporlanabilir.`;
}

/**
 * Mesajdaki [IMG:url] işaretini URL'ye parse eder.
 * Ör: "bak bu güzel [IMG:https://s3.../a.jpg]" → { text: "bak bu güzel ", images: ["https://..."] }
 */
export interface ParsedMessage {
  text: string;
  images: string[];
}

export function parseMessageContent(content: string): ParsedMessage {
  if (!content) return { text: '', images: [] };
  const images: string[] = [];
  const text = content.replace(/\[IMG:(https?:\/\/[^\]\s]+)\]/g, (_, url) => {
    images.push(url);
    return '';
  }).trim();
  return { text, images };
}

export function embedImageInMessage(existingText: string, imageUrl: string): string {
  const base = existingText ? existingText.trim() + ' ' : '';
  return `${base}[IMG:${imageUrl}]`;
}
