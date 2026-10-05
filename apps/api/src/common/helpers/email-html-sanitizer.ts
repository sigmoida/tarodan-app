/**
 * Yöneticinin yazdığı e-posta HTML'ini GÖNDERİLMEDEN önce temizler.
 *
 * İstemciye güvenilmez: admin formu da, onu atlayan bir API çağrısı da aynı
 * kapıdan geçer. Normal e-posta işaretlemesi (link, görsel, tablo, satır içi
 * stil) korunur; çalıştırılabilir ya da sayfayı bozabilir içerik (script,
 * olay işleyicileri, iframe/form/object, javascript: gibi şemalar, style
 * etiketi, `url()`/`expression()` içeren stil değerleri) atılır.
 *
 * Kütüphane: `sanitize-html` (htmlparser2 tabanlı, beyaz liste). Elle yazılmış
 * regex süzgeçleri HTML ayrıştırma tuhaflıkları yüzünden atlatılabildiği için
 * ayrıştırıcıya dayanıyoruz.
 */
import sanitizeHtml from "sanitize-html";
import { extractEmailTemplateContent } from "./email-template-renderer";

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "center",
  "code",
  "div",
  "em",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

/** Tüm etiketlerde izinli (olay işleyicisi ve id/class YOK). */
const GLOBAL_ATTRIBUTES = [
  "style",
  "align",
  "valign",
  "width",
  "height",
  "bgcolor",
  "dir",
  "title",
];

/** Stil değeri `url(`, `expression(`, `javascript:`, `@import` ya da `\` içermemeli. */
const SAFE_STYLE_VALUE =
  /^(?!.*(?:url\s*\(|expression|javascript:|@import|\\)).*$/i;

const STYLE_PROPERTIES = [
  "background-color",
  "border",
  "border-bottom",
  "border-collapse",
  "border-color",
  "border-left",
  "border-radius",
  "border-right",
  "border-spacing",
  "border-style",
  "border-top",
  "border-width",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "min-width",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-transform",
  "vertical-align",
  "width",
];

const ALLOWED_STYLES = {
  "*": Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [property, [SAFE_STYLE_VALUE]]),
  ),
};

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    "*": GLOBAL_ATTRIBUTES,
    a: [...GLOBAL_ATTRIBUTES, "href", "target", "rel", "name"],
    img: [...GLOBAL_ATTRIBUTES, "src", "alt", "border"],
    table: [...GLOBAL_ATTRIBUTES, "border", "cellpadding", "cellspacing"],
    td: [...GLOBAL_ATTRIBUTES, "colspan", "rowspan"],
    th: [...GLOBAL_ATTRIBUTES, "colspan", "rowspan"],
    font: [...GLOBAL_ATTRIBUTES, "color", "face", "size"],
  },
  allowedStyles: ALLOWED_STYLES,
  // Link: yalnız http(s)/mailto/tel. Görsel: yalnız http(s) (data: URI mail
  // boyutunu şişirir ve bazı istemcilerde engellenir).
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  // İçeriği de atılacak etiketler: <title> gibi metin taşıyanlar gövdeye sızmasın.
  nonTextTags: [
    "script",
    "style",
    "textarea",
    "option",
    "noscript",
    "title",
    "head",
  ],
  transformTags: {
    // Dışarı açılan her link referrer sızdırmasın / window.opener vermesin.
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
};

/**
 * Tam belge (`<html><body>`) yapıştırılırsa yalnız gövde içeriği alınır; ortak
 * mail iskeleti (logo, altbilgi) zaten `wrapEmailTemplateLayout` ile eklenir.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(extractEmailTemplateContent(html), OPTIONS).trim();
}
