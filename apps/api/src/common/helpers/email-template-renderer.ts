/**
 * Shared email template rendering utilities.
 * Used by EmailWorker (queue processor) and AdminService (preview).
 */

export interface EmailBrandOptions {
  frontendUrl?: string;
  logoUrl?: string;
  supportEmail?: string;
  preferencesUrl?: string;
}

export const EMAIL_CONTENT_START = "<!-- TARODAN_CONTENT_START -->";
export const EMAIL_CONTENT_END = "<!-- TARODAN_CONTENT_END -->";

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeEmailTemplateData(value: any): any {
  if (typeof value === "string") return escapeEmailHtml(value);
  if (Array.isArray(value)) return value.map(escapeEmailTemplateData);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        escapeEmailTemplateData(nested),
      ]),
    );
  }
  return value;
}

function normalizeEmailBrandOptions(
  input?: string | EmailBrandOptions,
): Required<EmailBrandOptions> {
  const options = typeof input === "string" ? { frontendUrl: input } : input;
  const frontendUrl = (
    options?.frontendUrl || "https://tarodan.com.tr"
  ).replace(/\/+$/, "");
  return {
    frontendUrl,
    // EMAIL_LOGO_URL: mail istemcileri logoyu kendi sunucularından çeker;
    // FRONTEND_URL localhost olduğunda (dev) erişemezler — herkese açık bir
    // URL ile override edilebilsin.
    logoUrl:
      options?.logoUrl ||
      process.env.EMAIL_LOGO_URL ||
      `${frontendUrl}/tarodan-logo.jpg`,
    supportEmail: options?.supportEmail || "destek@tarodan.com.tr",
    preferencesUrl:
      options?.preferencesUrl || `${frontendUrl}/profile/security`,
  };
}

function safeEmailUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return escapeEmailHtml(parsed.toString());
    }
  } catch {
    // Fall through to the configured safe URL.
  }
  return escapeEmailHtml(fallback);
}

export function substituteEmailVariables(
  text: string,
  data: Record<string, any>,
): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const val = key.includes(".")
      ? key
          .split(".")
          .reduce((o: any, k: string) => (o != null ? o[k] : undefined), data)
      : data[key];
    return val != null ? escapeEmailHtml(val) : `{{${key}}}`;
  });
}

export function extractEmailTemplateVariables(text: string): string[] {
  return Array.from(
    new Set(
      Array.from(text.matchAll(/\{\{([\w.]+)\}\}/g), (match) => match[1]),
    ),
  ).sort();
}

export function extractEmailTemplateContent(html: string): string {
  const start = html.indexOf(EMAIL_CONTENT_START);
  const end = html.indexOf(EMAIL_CONTENT_END);
  if (start >= 0 && end > start) {
    return html.slice(start + EMAIL_CONTENT_START.length, end).trim();
  }

  if (!/<(?:!doctype|html|body)\b/i.test(html)) return html.trim();

  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  return (body || html).trim();
}

export function wrapEmailTemplateLayout(
  content: string,
  title: string,
  data: Record<string, any> = {},
  brandInput?: string | EmailBrandOptions,
): string {
  const brand = normalizeEmailBrandOptions(brandInput);
  const frontendUrl = safeEmailUrl(brand.frontendUrl, "https://tarodan.com.tr");
  const logoUrl = safeEmailUrl(
    brand.logoUrl,
    `${frontendUrl}/tarodan-logo.jpg`,
  );
  const preferencesUrl = safeEmailUrl(
    brand.preferencesUrl,
    `${frontendUrl}/profile/security`,
  );
  const supportEmail = escapeEmailHtml(brand.supportEmail);

  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <title>${escapeEmailHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f7f8; font-family: Arial, Helvetica, sans-serif; color: #27272a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; background-color: #f7f7f8;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 600px; background-color: #ffffff; border: 1px solid #e7e7e9; border-radius: 8px;">
          <tr>
            <td style="padding: 28px 36px 24px; text-align: left; border-bottom: 3px solid #ff6b00;">
              <a href="${frontendUrl}" style="display: inline-block; text-decoration: none;">
                <img src="${logoUrl}" width="176" alt="Tarodan" style="display: block; width: 176px; max-width: 100%; height: auto; border: 0;" />
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px;">
              ${EMAIL_CONTENT_START}
              ${content}
              ${EMAIL_CONTENT_END}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 36px 28px; background-color: #fafafa; border-top: 1px solid #ededee; color: #71717a;">
              <p style="margin: 0 0 12px; font-size: 13px; line-height: 1.6;">
                Yardım için <a href="mailto:${supportEmail}" style="color: #d95700; text-decoration: none;">${supportEmail}</a> adresinden bize ulaşabilirsiniz.
              </p>
              <p style="margin: 0 0 12px; font-size: 12px; line-height: 1.6;">
                <a href="${frontendUrl}" style="color: #52525b; text-decoration: none; margin-right: 14px;">Tarodan</a>
                <a href="${preferencesUrl}" style="color: #52525b; text-decoration: none;">Bildirim tercihleri</a>
              </p>
              <p style="margin: 0; font-size: 11px; line-height: 1.6; color: #a1a1aa;">
                © ${new Date().getFullYear()} Tarodan. Bu e-posta ${escapeEmailHtml(data?.to || "size")} gönderilmiştir.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderStoredEmailTemplate(
  bodyHtml: string,
  subject: string,
  data: Record<string, any>,
  brandInput?: string | EmailBrandOptions,
): { subject: string; html: string; bodyHtml: string } {
  const body = extractEmailTemplateContent(bodyHtml);
  const renderedBody = substituteEmailVariables(body, data);
  const renderedSubject = substituteEmailVariables(subject, data);
  return {
    subject: renderedSubject,
    bodyHtml: body,
    html: wrapEmailTemplateLayout(
      renderedBody,
      renderedSubject || "Tarodan Bildirim",
      data,
      brandInput,
    ),
  };
}

export function renderManagedEmailTemplate(
  template: string,
  data: Record<string, any>,
  storedTemplate?: { bodyHtml?: string | null; subject?: string | null } | null,
  brandInput?: string | EmailBrandOptions,
): { subject: string; html: string } {
  const defaultSubject = getEmailTemplateSubject(template, data);
  if (storedTemplate?.bodyHtml?.trim()) {
    const rendered = renderStoredEmailTemplate(
      storedTemplate.bodyHtml,
      storedTemplate.subject?.trim() || defaultSubject,
      data,
      brandInput,
    );
    return { subject: rendered.subject, html: rendered.html };
  }

  return {
    subject: defaultSubject,
    html: renderEmailTemplate(template, data, brandInput),
  };
}

export function formatEmailPrice(amount: number | string): string {
  if (typeof amount === "string") return amount;
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getEmailTemplateSubject(
  template: string,
  data: Record<string, any>,
): string {
  const subjects: Record<string, string> = {
    welcome: "Tarodan'a Hoş Geldiniz!",
    "order-confirmation": `Sipariş Onayı - #${data?.orderNumber || data?.orderId || ""}`,
    "order-created-buyer": `Siparişiniz alındı - ${data?.orderNumber || ""}`,
    "order-created-seller": `Yeni sipariş - ${data?.orderNumber || ""}`,
    "order-paid": `Ödeme alındı - ${data?.orderNumber || ""}`,
    "order-paid-group": `Siparişiniz alındı - ${data?.groupNumber || ""}`,
    "order-paid-seller": `Yeni sipariş - ${data?.orderNumber || ""}`,
    "order-shipped": "Siparişiniz Kargoya Verildi",
    "order-delivered": "Siparişiniz Teslim Edildi",
    "password-reset": "Şifre Sıfırlama Talebi",
    "email-verification": "E-posta Adresinizi Doğrulayın",
    "offer-received": "Yeni Teklif Aldınız",
    "offer-accepted": "Teklifiniz Kabul Edildi",
    "payment-received": "Ödeme Alındı",
    "payment-failed": `Ödeme Tamamlanamadı - ${data?.orderNumber || ""}`,
    "payment-refunded": `İade İşleminiz Tamamlandı - ${data?.orderNumber || ""}`,
    "payment-refunded-seller": `İade İşlemi Bildirimi - ${data?.orderNumber || ""}`,
    "premium-offer": "Premium Üyelik ile Daha Fazla Fırsat",
    "membership-expiring": `${data?.tierName || "Üyeliğiniz"} Sona Eriyor`,
    "membership-expiring-urgent": `${data?.tierName || "Üyeliğiniz"} Yarın Sona Eriyor!`,
    "product-approved": "Ürününüz Onaylandı",
    "seller-document-revision": "Kurumsal Başvurunuzda Belge Güncellemesi",
    "wishlist-price-change": data?.isPriceDrop
      ? `Fiyat Düştü: ${data?.productTitle || ""}`
      : `Fiyat Değişti: ${data?.productTitle || ""}`,
    "marketing-newsletter": "Tarodan Haftalık Bülteni",
    "marketing-monthly": "Tarodan Aylık Özel Fırsatlar",
    "seller-did-not-ship-refunded": "Satıcı Kargoya Vermedi — İadeniz Yapıldı",
    "trade-received": "Yeni Takas Teklifi Aldınız",
    "trade-accepted": "Takas Teklifiniz Kabul Edildi",
    "trade-shipped": "Takasınız Kargoya Verildi",
    "trade-completed": "Takasınız Tamamlandı",
    "guest-checkout-otp": "Misafir Sipariş Doğrulama Kodu",
    "email-change-otp": "E-posta Değişikliği Doğrulama Kodu",
    "site-access-invite": "Tarodan Erken Erişim Davetiniz",
    "invoice-buyer": `Faturanız - ${data?.invoiceNumber || ""}`,
    "invoice-seller": `Satış Faturası - ${data?.invoiceNumber || ""}`,
    "elogo-invoice": `Tarodan e-Arşiv Faturanız - ${data?.invoiceNumber || ""}`,
    "seller-invoice": `Satıcı Faturanız - Sipariş #${data?.orderNumber || ""}`,
    "order-cancelled-buyer": `Siparişiniz İptal Edildi - ${data?.orderNumber || ""}`,
    "order-cancelled-seller": `Sipariş İptal Edildi - ${data?.orderNumber || ""}`,
    "refund-requested-seller": `İade Talebi - ${data?.orderNumber || ""}`,
    "refund-approved-buyer": `İade Talebiniz Onaylandı - ${data?.orderNumber || ""}`,
    "refund-rejected-buyer": `İade Talebiniz Hakkında - ${data?.orderNumber || ""}`,
    "refund-return-label-buyer": `İade Kargo Bilgileri - ${data?.orderNumber || ""}`,
    "refund-completed": `İadeniz Tamamlandı - ${data?.orderNumber || ""}`,
    "refund-request-received-buyer": `İade Talebiniz Alındı - ${data?.orderNumber || ""}`,
    "refund-return-incoming-seller": `İade Kargosu Yola Çıktı - ${data?.orderNumber || ""}`,
    "refund-completed-seller": `İade Tamamlandı - ${data?.orderNumber || ""}`,
    "refund-auto-accepted-seller": `İade Otomatik Onaylandı - ${data?.orderNumber || ""}`,
    "review-received-seller": "Yeni Değerlendirme Aldınız",
    "listing-expiring": `İlanınızın Süresi Doluyor${data?.productTitle ? ` - ${data.productTitle}` : ""}`,
    "listing-expired": `İlanınızın Süresi Doldu${data?.productTitle ? ` - ${data.productTitle}` : ""}`,
    "new-follower": `${data?.followerName || "Yeni bir kullanıcı"} sizi takip etmeye başladı`,
    "back-in-stock": `Stoğa Geri Geldi: ${data?.productTitle || "Takip Ettiğiniz Ürün"}`,
    "payout-released-seller": `Ödemeniz Aktarıldı - ${formatEmailPrice(data?.payoutAmount || 0)} TL`,
    "payout-returned-seller": `Ödemeniz Geri Döndü - ${formatEmailPrice(data?.payoutAmount || 0)} TL`,
    "payout-failed-seller": `Ödemeniz Aktarılamadı - ${formatEmailPrice(data?.payoutAmount || 0)} TL`,
  };
  return data?.subject || subjects[template] || "Tarodan Bildirim";
}

export function renderEmailTemplate(
  template: string,
  data: Record<string, any>,
  brandInput: string | EmailBrandOptions = "https://tarodan.com.tr",
): string {
  const rawData = data;
  const brand = normalizeEmailBrandOptions(brandInput);
  const frontendUrl = brand.frontendUrl;
  const isGuest =
    rawData?.isGuestOrder === true ||
    rawData?.buyerSystemEmail === "guest@tarodan.system";
  const guestEmail = (rawData?.buyerEmail || "").trim().toLowerCase();
  const orderPaidTrackUrl =
    isGuest && rawData?.orderNumber
      ? `${frontendUrl}/track-order?orderNumber=${encodeURIComponent(rawData.orderNumber)}${guestEmail ? `&email=${encodeURIComponent(guestEmail)}` : ""}`
      : `${frontendUrl}/profile/orders/${rawData?.orderId || ""}`;
  // Grup (sepet) ödemesinde tek takip linki: üye → sipariş listesi, misafir →
  // temsilci siparişin track-order sayfası (grup için tekil sipariş sayfası yok).
  const orderPaidGroupTrackUrl =
    isGuest && rawData?.orderNumber
      ? `${frontendUrl}/track-order?orderNumber=${encodeURIComponent(rawData.orderNumber)}${guestEmail ? `&email=${encodeURIComponent(guestEmail)}` : ""}`
      : `${frontendUrl}/profile/orders`;

  data = escapeEmailTemplateData(rawData);
  const wrapEmail = (content: string, title: string) =>
    wrapEmailTemplateLayout(content, title, data, brand);

  const primaryButton = (text: string, href: string) => `
    <a href="${safeEmailUrl(href, frontendUrl)}" style="display: inline-block; padding: 13px 28px; background-color: #ff6b00; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; text-align: center;">${text}</a>`;

  const infoBox = (content: string) => `
    <div style="background-color: #fffaf5; padding: 18px 20px; border-radius: 6px; margin: 24px 0; border: 1px solid #ffe2cc;">${content}</div>`;

  const detailsBox = (content: string) => `
    <div style="background-color: #fafafa; padding: 22px; border-radius: 6px; margin: 24px 0; border: 1px solid #ededee;">${content}</div>`;

  const successBox = (content: string) => `
    <div style="background-color: #f4fbf6; padding: 18px 20px; border-radius: 6px; margin: 24px 0; border: 1px solid #d8efde;">${content}</div>`;

  const warningBox = (content: string) => `
    <div style="background-color: #fffaf0; padding: 18px 20px; border-radius: 6px; margin: 24px 0; border: 1px solid #f5e4bd;">${content}</div>`;

  const detailRow = (label: string, value: string, highlight?: boolean) => `
    <tr>
      <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">${label}</td>
      <td style="padding: 8px 0; color: ${highlight ? "#f97316" : "#111827"}; font-size: 14px; font-weight: ${highlight ? "700" : "500"}; text-align: right;">${value}</td>
    </tr>`;

  const greeting = (name: string) => `
    <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">Merhaba <strong style="color: #111827;">${name || "Değerli Üyemiz"}</strong>,</p>`;

  const titleBlock = (text: string, _decoration?: string) => `
    <h2 style="font-size: 24px; font-weight: 700; color: #27272a; margin: 0 0 16px 0; line-height: 1.3;">${text}</h2>`;

  // Ürün adına adet ekle ("Ürün adı × 3"); adet 1/boş ise gürültü yapma.
  const qtyLabel = (productTitle: string, qty?: number) =>
    qty && Number(qty) > 1
      ? `${productTitle || "Ürün"} × ${qty}`
      : productTitle || "Ürün";
  // Kargo değeri: 0 → "Ücretsiz" (pakete dahil), aksi halde tutar + TL.
  const shippingValue = (cost: number) =>
    cost > 0 ? `${formatEmailPrice(cost)} TL` : "Ücretsiz";

  const templates: Record<string, string> = {
    welcome: wrapEmail(
      `
      ${titleBlock("Tarodan'a Hoş Geldiniz!", "🎉")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Türkiye'nin en büyük diecast pazaryerine katıldığınız için teşekkür ederiz!</p>
      ${successBox(`<p style="margin: 0; font-size: 14px; color: #166534;">Hesabınız başarıyla oluşturuldu.<br/>E-postanızı doğrulayarak tüm özelliklere erişebilirsiniz.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("E-postamı Doğrula", data?.verifyUrl || frontendUrl)}
      </div>
      <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0 0;">İyi alışverişler dileriz!<br/><strong style="color: #f97316;">Tarodan Ekibi</strong></p>
    `,
      "Tarodan'a Hoş Geldiniz!",
    ),

    "order-confirmation": wrapEmail(
      `
      ${titleBlock("Sipariş Onayı", "✅")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Siparişiniz başarıyla oluşturuldu!</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || data?.orderId || ""))}
          ${detailRow("Toplam Tutar", formatEmailPrice(data?.total || data?.totalAmount || 0) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "Sipariş Onayı",
    ),

    "order-created-buyer": wrapEmail(
      `
      ${titleBlock("Siparişiniz Alındı", "🛒")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Siparişiniz başarıyla oluşturuldu ve ödemeniz alındı.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Ürün", data?.productTitle || "")}
          ${detailRow("Tutar", formatEmailPrice(data?.totalAmount || 0) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Siparişiniz hazırlandığında size bilgi vereceğiz.</p>`)}
    `,
      "Siparişiniz Alındı",
    ),

    "order-created-seller": wrapEmail(
      `
      ${titleBlock("Yeni Sipariş!", "🎉")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Tebrikler! Ürününüz için yeni bir sipariş aldınız.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Yeni satış bildirimi</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Ürün", data?.productTitle || "")}
          ${detailRow("Tutar", formatEmailPrice(data?.totalAmount || 0) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/seller/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "Yeni Sipariş!",
    ),

    "order-paid": wrapEmail(
      `
      ${titleBlock("Ödeme Alındı", "✅")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Siparişiniz için ödeme başarıyla alındı.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Ödeme başarıyla tamamlandı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Ürün", qtyLabel(data?.productTitle, data?.quantity))}
          ${detailRow("Ödenen Tutar", formatEmailPrice(data?.totalAmount || 0) + " TL", true)}
          ${detailRow("İşlem No", data?.transactionId || "")}
          ${detailRow("Ödeme Yöntemi", data?.paymentMethod || "Kredi Kartı")}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Takip Et", orderPaidTrackUrl)}
      </div>
    `,
      "Ödeme Alındı",
    ),

    // Çoklu-ürün (sepet) ödemesinde alıcıya ürün başına değil, CheckoutGroup
    // başına TEK onay maili. Ürünler satır satır listelenir, grup toplamı ve tek
    // takip linki verilir. Satıcı mailleri/faturalar ÜRÜN BAŞINA ('order-paid-seller').
    "order-paid-group": wrapEmail(
      `
      ${titleBlock("Siparişiniz Alındı", "✅")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Siparişiniz için ödeme başarıyla alındı. Ürünleriniz satıcı bazında paketler halinde (her satıcı için ayrı kargo) gönderilecektir.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Ödeme başarıyla tamamlandı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${data?.groupNumber ? detailRow("Sipariş No", "#" + data.groupNumber) : ""}
          ${(Array.isArray(data?.items) ? data.items : [])
            .map((item: any) =>
              detailRow(
                qtyLabel(item?.productTitle, item?.quantity),
                formatEmailPrice(
                  Number(item?.totalAmount || 0) -
                    Number(item?.shippingCost || 0),
                ) + " TL",
              ),
            )
            .join("")}
          ${(Array.isArray(data?.sellerShipments) ? data.sellerShipments : [])
            .map((s: any) =>
              detailRow(
                "Kargo · " + (s?.sellerName || "Satıcı"),
                shippingValue(Number(s?.shippingCost || 0)),
              ),
            )
            .join("")}
          ${detailRow("Toplam Tutar", formatEmailPrice(data?.groupTotal || 0) + " TL", true)}
          ${detailRow("İşlem No", data?.transactionId || "")}
          ${detailRow("Ödeme Yöntemi", data?.paymentMethod || "Kredi Kartı")}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişleri Takip Et", orderPaidGroupTrackUrl)}
      </div>
    `,
      "Siparişiniz Alındı",
    ),

    "order-paid-seller": wrapEmail(
      `
      ${titleBlock("Yeni Sipariş!", "🎉")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Tebrikler! Ürününüz satıldı ve ödemesi alındı. Lütfen ürünü <strong style="color: #dc2626;">en geç 3 iş günü</strong> içinde kargoya veriniz.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Ödeme hesabınıza yansıyacak</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Ürün", qtyLabel(data?.productTitle, data?.quantity))}
          ${detailRow("Satış Tutarı", formatEmailPrice(data?.totalAmount || 0) + " TL")}
          ${detailRow("Komisyon", "-" + formatEmailPrice(data?.commissionAmount || 0) + " TL")}
          ${detailRow("Net Kazancınız", formatEmailPrice(data?.netAmount || (data?.totalAmount || 0) - (data?.commissionAmount || 0)) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Kargo Bilgisi Gir", `${frontendUrl}/seller/orders/${data?.orderId || ""}`)}
      </div>
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Not: Ödemeniz, alıcı ürünü teslim aldıktan 14 gün sonra hesabınıza aktarılacaktır.</p>`)}
    `,
      "Yeni Sipariş!",
    ),

    "order-shipped": wrapEmail(
      `
      ${titleBlock("Siparişiniz Kargoya Verildi", "📦")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Harika haber! Siparişiniz kargoya verildi.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Kargo Firması", data?.provider || "")}
          ${detailRow("Takip No", data?.trackingNumber || "", true)}
          ${data?.estimatedDelivery ? detailRow("Tahmini Teslimat", data.estimatedDelivery) : ""}
        </table>
      `)}
      ${data?.trackingUrl ? `<div style="text-align: center; margin: 32px 0;">${primaryButton("Kargoyu Takip Et", data.trackingUrl)}</div>` : ""}
    `,
      "Siparişiniz Kargoya Verildi",
    ),

    "order-delivered": wrapEmail(
      `
      ${titleBlock("Siparişiniz Teslim Edildi", "🎁")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Siparişiniz başarıyla teslim edildi!</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Teslimat tamamlandı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
        </table>
      `)}
      <p style="font-size: 14px; color: #4b5563; margin: 20px 0;">Siparişiniz teslim edildi. Teslim tarihinden itibaren <strong>14 gün içinde koşulsuz iade</strong> hakkınız bulunmaktadır.</p>
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Not: 14 günlük iade süresi dolduğunda siparişiniz otomatik olarak tamamlanır.</p>`)}
    `,
      "Siparişiniz Teslim Edildi",
    ),

    "password-reset": wrapEmail(
      `
      ${titleBlock("Şifre Sıfırlama Talebi", "🔐")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Hesabınız için şifre sıfırlama talebinde bulundunuz.</p>
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Şifremi Sıfırla", data?.resetUrl || "")}
      </div>
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Bu bağlantı 1 saat geçerlidir. Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>`)}
    `,
      "Şifre Sıfırlama",
    ),

    "offer-received": wrapEmail(
      `
      ${titleBlock("Yeni Teklif Aldınız!", "💰")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Ürününüz için yeni bir teklif aldınız!</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Ürün", data?.productTitle || "")}
          ${detailRow("Ürün Fiyatı", formatEmailPrice(data?.productPrice || 0) + " TL")}
          ${detailRow("Teklif Tutarı", formatEmailPrice(data?.offerAmount || 0) + " TL", true)}
          ${detailRow("Teklif Veren", data?.buyerName || "")}
        </table>
      `)}
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Bu teklifin süresi ${data?.expiresAt ? new Date(data.expiresAt).toLocaleString("tr-TR") : "24 saat içinde"} dolacak.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Teklifi İncele", `${frontendUrl}/profile/offers`)}
      </div>
    `,
      "Yeni Teklif Aldınız!",
    ),

    "offer-accepted": wrapEmail(
      `
      ${titleBlock("Teklifiniz Kabul Edildi!", "🎉")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Tebrikler! <strong>${data?.productTitle || ""}</strong> ürünü için verdiğiniz teklif kabul edildi.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Teklifiniz onaylandı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Ürün", data?.productTitle || "")}
          ${detailRow("Kabul Edilen Tutar", formatEmailPrice(data?.offerAmount || 0) + " TL", true)}
          ${detailRow("Satıcı", data?.sellerName || "")}
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
        </table>
      `)}
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Siparişinizi tamamlamak için ödeme yapmanız gerekmektedir.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Ödeme Yap", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "Teklifiniz Kabul Edildi!",
    ),

    "wishlist-price-change": wrapEmail(
      `
      ${titleBlock(data?.isPriceDrop ? "Fiyat Düştü!" : "Fiyat Değişti!", data?.isPriceDrop ? "🎉" : "📈")}
      ${greeting(data?.userName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">İstek listenizdeki bir ürünün fiyatı değişti:</p>
      ${detailsBox(`
        <p style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #111827;">${data?.productTitle || ""}</p>
        <table width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Eski Fiyat</td>
            <td style="padding: 8px 0; color: #9ca3af; font-size: 14px; text-decoration: line-through; text-align: right;">${formatEmailPrice(data?.oldPrice || 0)} TL</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Yeni Fiyat</td>
            <td style="padding: 8px 0; color: ${data?.isPriceDrop ? "#16a34a" : "#dc2626"}; font-size: 18px; font-weight: 700; text-align: right;">${formatEmailPrice(data?.newPrice || 0)} TL</td>
          </tr>
        </table>
      `)}
      ${data?.isPriceDrop ? successBox(`<p style="margin: 0; font-size: 14px; color: #166534;">Bu ürünün fiyatı düştü. Hemen almak için aşağıdaki butona tıklayın.</p>`) : ""}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Ürünü Görüntüle", data?.productUrl || frontendUrl)}
      </div>
    `,
      data?.isPriceDrop ? "Fiyat Düştü!" : "Fiyat Değişti!",
    ),

    "marketing-newsletter": wrapEmail(
      `
      ${titleBlock("Tarodan Haftalık Bülteni", "📰")}
      ${greeting(data?.userName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Bu hafta en çok ilgi gören ürünler:</p>
      ${
        Array.isArray(data?.trendingProducts) &&
        data.trendingProducts.length > 0
          ? `<div style="margin: 24px 0;">${data.trendingProducts
              .map(
                (p: any) => `
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 12px; margin-bottom: 12px; border: 1px solid #e2e8f0;">
            <p style="font-weight: 600; margin: 0 0 8px 0; color: #111827;">${p.title}</p>
            <p style="color: #f97316; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">${formatEmailPrice(p.price)} TL</p>
            <a href="${p.productUrl}" style="color: #f97316; text-decoration: none; font-weight: 500; font-size: 14px;">İncele</a>
          </div>`,
              )
              .join("")}</div>`
          : '<p style="color: #6b7280;">Bu hafta öne çıkan ürün bulunmamaktadır.</p>'
      }
    `,
      "Tarodan Haftalık Bülteni",
    ),

    "marketing-monthly": wrapEmail(
      `
      ${titleBlock("Tarodan Aylık Özel Fırsatlar", "🎁")}
      ${greeting(data?.userName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Bu ay sizin için özel olarak seçtiğimiz ürünler:</p>
      ${
        Array.isArray(data?.featuredProducts) &&
        data.featuredProducts.length > 0
          ? `<div style="margin: 24px 0;">${data.featuredProducts
              .map(
                (p: any) => `
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 12px; margin-bottom: 12px; border: 1px solid #e2e8f0;">
            <p style="font-weight: 600; margin: 0 0 8px 0; color: #111827;">${p.title}</p>
            <p style="color: #f97316; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">${formatEmailPrice(p.price)} TL</p>
            <a href="${p.productUrl}" style="color: #f97316; text-decoration: none; font-weight: 500; font-size: 14px;">İncele</a>
          </div>`,
              )
              .join("")}</div>`
          : '<p style="color: #6b7280;">Bu ay öne çıkan ürün bulunmamaktadır.</p>'
      }
    `,
      "Tarodan Aylık Özel Fırsatlar",
    ),

    "payment-failed": wrapEmail(
      `
      ${titleBlock("Ödemeniz Tamamlanamadı", "⚠️")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Siparişiniz için ödeme işlemi tamamlanamadı ve sipariş iptal edildi.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Tutar", formatEmailPrice(data?.amount || 0) + " TL", true)}
        </table>
      `)}
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">${data?.failureReason || "Ödeme işlemi tamamlanamadı."}</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Alışverişe Devam Et", `${frontendUrl}/listings`)}
      </div>
    `,
      "Ödemeniz Tamamlanamadı",
    ),

    "payment-refunded": wrapEmail(
      `
      ${titleBlock("İade İşleminiz Tamamlandı", "💰")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Siparişiniz için iade işlemi başarıyla gerçekleştirildi.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">İade işlemi onaylandı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("İade Tutarı", formatEmailPrice(data?.refundAmount || 0) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İade İşleminiz Tamamlandı",
    ),

    "payment-refunded-seller": wrapEmail(
      `
      ${titleBlock("İade İşlemi Bildirimi", "🔄")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Bir siparişiniz için iade işlemi gerçekleştirildi.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("İade Tutarı", formatEmailPrice(data?.refundAmount || 0) + " TL", true)}
        </table>
      `)}
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">İade tutarı alıcıya aktarılmıştır. Herhangi bir işlem yapmanıza gerek yoktur.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/seller/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İade İşlemi Bildirimi",
    ),

    "premium-offer": wrapEmail(
      `
      ${titleBlock("Premium ile Daha Fazlası Sizi Bekliyor", "🌟")}
      ${greeting(data?.userName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Tarodan'da daha fazla satış ve özel ayrıcalıklar için Premium üyeliğe geçin!</p>
      ${detailsBox(`
        <p style="margin: 0 0 12px 0; font-weight: 600; color: #111827;">Premium üyelik avantajları</p>
        ${
          Array.isArray(data?.benefits) && data.benefits.length > 0
            ? `<ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.9;">${data.benefits.map((b: string) => `<li>${b}</li>`).join("")}</ul>`
            : `<p style="margin: 0; color: #4b5563; font-size: 14px;">Sınırsız ilan, takas, Digital Garage ve daha fazlası.</p>`
        }
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton(data?.ctaText || "Premium Üye Ol", data?.ctaUrl || `${frontendUrl}/profile/membership`)}
      </div>
    `,
      "Premium Üyelik",
    ),

    "membership-expiring": wrapEmail(
      `
      ${titleBlock("Üyeliğiniz Sona Eriyor", "⏰")}
      ${greeting(data?.userName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;"><strong style="color: #111827;">${data?.tierName || "Üyeliğiniz"}</strong> üyeliğinizin süresi ${data?.daysRemaining ? `${data.daysRemaining} gün içinde ` : ""}sona erecek.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Üyelik", data?.tierName || "")}
          ${data?.expirationDate ? detailRow("Bitiş Tarihi", String(data.expirationDate), true) : ""}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Üyeliğimi Yenile", data?.renewUrl || `${frontendUrl}/profile/membership`)}
      </div>
    `,
      "Üyeliğiniz Sona Eriyor",
    ),

    "membership-expiring-urgent": wrapEmail(
      `
      ${titleBlock("Üyeliğiniz Yarın Sona Eriyor!", "🚨")}
      ${greeting(data?.userName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;"><strong style="color: #111827;">${data?.tierName || "Üyeliğiniz"}</strong> üyeliğinizin süresi <strong style="color: #dc2626;">yarın (${data?.expirationDate || ""})</strong> sona eriyor.</p>
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Üyeliğiniz sona erdiğinde Premium özelliklere erişiminiz kısıtlanacaktır.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Hemen Yenile", data?.renewUrl || `${frontendUrl}/profile/membership`)}
      </div>
    `,
      "Üyeliğiniz Yarın Sona Eriyor!",
    ),

    "email-verification": wrapEmail(
      `
      ${titleBlock("E-postanızı Doğrulayın", "✉️")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Tarodan hesabınızı etkinleştirmek için e-posta adresinizi doğrulamanız gerekmektedir.</p>
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("E-postamı Doğrula", data?.verificationUrl || data?.verifyUrl || `${frontendUrl}/verify-email`)}
      </div>
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Bu link ${data?.expiresIn || "24 saat"} içinde geçerliliğini yitirecektir.</p>`)}
      <p style="font-size: 14px; color: #6b7280; margin: 16px 0;">Bu hesabı siz oluşturmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>
    `,
      "E-posta Doğrulama",
    ),

    "payment-received": wrapEmail(
      `
      ${titleBlock("Ödeme Alındı", "✅")}
      ${greeting(data?.buyerName || data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Ödemeniz başarıyla alındı.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Ödeme onaylandı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Tutar", formatEmailPrice(data?.amount || data?.totalAmount || 0) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "Ödeme Alındı",
    ),

    "product-approved": wrapEmail(
      `
      ${titleBlock("Ürününüz Onaylandı", "✅")}
      ${greeting(data?.sellerName || data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Ürününüz incelendi ve yayına alındı. Alıcılar artık ürününüzü görebilir!</p>
      ${successBox(`
          <p style="margin: 0 0 8px 0; font-size: 16px; color: #166534; font-weight: 600;">Ürün yayında</p>
        <p style="margin: 0; font-size: 14px; color: #166534;">${data?.productTitle || ""}</p>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Ürünü Görüntüle", data?.productUrl || frontendUrl)}
      </div>
    `,
      "Ürününüz Onaylandı",
    ),

    "seller-application-approved": wrapEmail(
      `
      ${titleBlock("Kurumsal Başvurunuz Onaylandı!", "🎉")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        ${
          data?.invitationUrl
            ? "Kurumsal hesap ön başvurunuz onaylandı. Hesabınızı oluşturmak için aşağıdaki tek kullanımlık bağlantıdan kullanıcı adınızı ve ilk şifrenizi belirleyin."
            : "Tarodan'a kurumsal hesap başvurunuzu inceledik ve onayladık. Artık ürün listeleyebilir, satış yapabilir ve tüm satıcı özelliklerine erişebilirsiniz."
        }
      </p>
      ${successBox(`
        <p style="margin: 0 0 6px 0; font-size: 16px; color: #166534; font-weight: 600;">${data?.invitationUrl ? "Ön başvuru onaylandı" : "Kurumsal hesap aktif"}</p>
        ${data?.companyName ? `<p style="margin: 0; font-size: 14px; color: #166534;">${data.companyName}</p>` : ""}
      `)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 20px 0;">${data?.invitationUrl ? `Bağlantı ${data?.invitationExpiresHours || 72} saat geçerlidir.` : "Başlamak için satıcı panelinizi ziyaret edebilirsiniz:"}</p>
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton(data?.invitationUrl ? "Kurumsal Hesabı Oluştur" : "Satıcı Paneline Git", data?.invitationUrl || `${frontendUrl}/seller/dashboard`)}
      </div>
      <p style="font-size: 14px; color: #6b7280; margin: 0;">İyi satışlar dileriz!<br/><strong style="color: #f97316;">Tarodan Ekibi</strong></p>
    `,
      "Kurumsal Başvurunuz Onaylandı!",
    ),

    "seller-application-rejected": wrapEmail(
      `
      ${titleBlock("Kurumsal Başvurunuz Hakkında", "ℹ️")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Kurumsal hesap başvurunuzu inceledik. Üzgünüz, şu an için başvurunuzu onaylayamıyoruz.
      </p>
      ${
        data?.reason
          ? warningBox(`
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #92400e; font-weight: 600;">Red Nedeni:</p>
        <p style="margin: 0; font-size: 14px; color: #92400e;">${data.reason}</p>
      `)
          : ""
      }
      ${detailsBox(`
        <p style="margin: 0; font-size: 14px; color: #4b5563;">
          Eksik veya hatalı bilgilerinizi güncelleyerek tekrar başvurabilirsiniz.
          Herhangi bir sorunuz için destek ekibimizle iletişime geçebilirsiniz.
        </p>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Profilimi Güncelle", `${frontendUrl}/profile`)}
      </div>
      <p style="font-size: 14px; color: #6b7280; margin: 0;">
        Sorularınız için: <a href="mailto:destek@tarodan.com.tr" style="color: #d95700;">destek@tarodan.com.tr</a>
      </p>
    `,
      "Kurumsal Başvurunuz Hakkında",
    ),

    "seller-document-revision": wrapEmail(
      `
      ${titleBlock("Belge Güncellemesi Gerekiyor", "📄")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Kurumsal başvurunuzdaki <strong>${data?.documentType || "belge"}</strong> için güncelleme istendi.
      </p>
      ${warningBox(`
        <p style="margin: 0; font-size: 14px; color: #92400e;">${data?.reason || "Lütfen belgeyi kontrol ederek yeniden yükleyin."}</p>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Belgelerimi Yönet", `${frontendUrl}/profile/business`)}
      </div>
    `,
      "Belge Güncellemesi Gerekiyor",
    ),

    "seller-did-not-ship-refunded": wrapEmail(
      `
      ${titleBlock("Satıcı Kargoya Vermedi — İadeniz Yapıldı", "💰")}
      ${greeting(data?.name || data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Satıcının belirlenen süre içinde kargoya vermemesi nedeniyle siparişiniz iptal edildi ve ödemeniz iade edildi.
      </p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">İade işleminiz başlatıldı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || data?.orderId || ""))}
          ${data?.refundAmount ? detailRow("İade Tutarı", formatEmailPrice(data.refundAmount) + " TL", true) : ""}
        </table>
      `)}
      <p style="font-size: 14px; color: #6b7280; margin: 16px 0;">İade tutarı ödeme yönteminize bağlı olarak 3–5 iş günü içinde yansıyacaktır.</p>
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "Satıcı Kargoya Vermedi — İadeniz Yapıldı",
    ),

    "trade-received": wrapEmail(
      `
      ${titleBlock("Yeni Takas Teklifi Aldınız!", "🔄")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Bir kullanıcı size takas teklifi gönderdi. Teklifi inceleyip kabul veya reddedebilirsiniz.
      </p>
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Takas teklifleri sınırlı süre geçerlidir. Hızlı yanıt verin.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Teklifi İncele", data?.tradeUrl || `${frontendUrl}/profile/trades`)}
      </div>
    `,
      "Yeni Takas Teklifi Aldınız!",
    ),

    "trade-accepted": wrapEmail(
      `
      ${titleBlock("Takas Teklifiniz Kabul Edildi!", "🎉")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Harika haber! Takas teklifiniz karşı taraf tarafından kabul edildi.
      </p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Takas onaylandı. Şimdi ürününüzü kargolayın.</p>`)}
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Ürününüzü en kısa sürede kargoya vermeyi unutmayın.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Takası Görüntüle", data?.tradeUrl || `${frontendUrl}/profile/trades`)}
      </div>
    `,
      "Takas Teklifiniz Kabul Edildi!",
    ),

    "trade-shipped": wrapEmail(
      `
      ${titleBlock("Takasınız Kargoya Verildi!", "🚚")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Takas ürünü kargoya verildi ve size doğru yola çıktı.
      </p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${data?.trackingNumber ? detailRow("Takip No", data.trackingNumber) : ""}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Takası Takip Et", data?.tradeUrl || `${frontendUrl}/profile/trades`)}
      </div>
    `,
      "Takasınız Kargoya Verildi!",
    ),

    "trade-completed": wrapEmail(
      `
      ${titleBlock("Takasınız Tamamlandı!", "✅")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Takas işleminiz başarıyla tamamlandı. Umarız her iki taraf için de keyifli bir deneyim olmuştur!
      </p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Takas başarıyla tamamlandı</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Takası Görüntüle", data?.tradeUrl || `${frontendUrl}/profile/trades`)}
      </div>
      <p style="font-size: 14px; color: #6b7280; margin: 16px 0 0 0;">İyi takaslar dileriz!<br/><strong style="color: #f97316;">Tarodan Ekibi</strong></p>
    `,
      "Takasınız Tamamlandı!",
    ),

    "guest-checkout-otp": wrapEmail(
      `
      ${titleBlock("Misafir Sipariş Doğrulama Kodu", "🔑")}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Misafir alışverişinizi tamamlamak için doğrulama kodunuz:</p>
      <div style="text-align: center; margin: 32px 0;">
        <div style="display: inline-block; background: #f3f4f6; border: 2px dashed #d1d5db; border-radius: 16px; padding: 24px 48px;">
          <p style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #111827; margin: 0; font-family: monospace;">${data?.code || ""}</p>
        </div>
      </div>
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Bu kod <strong>${data?.expiresInMinutes || 10} dakika</strong> geçerlidir. Başkasıyla paylaşmayın.</p>`)}
      <p style="font-size: 14px; color: #6b7280; margin: 16px 0 0 0;">Bu kodu siz talep etmediyseniz bu e-postayı görmezden gelebilirsiniz.</p>
    `,
      "Misafir Sipariş Doğrulama Kodu",
    ),

    "email-change-otp": wrapEmail(
      `
      ${titleBlock("E-posta Değişikliği Doğrulama Kodu", "📧")}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Hesabınızın e-posta adresini bu adresle değiştirmek için doğrulama kodunuz:</p>
      <div style="text-align: center; margin: 32px 0;">
        <div style="display: inline-block; background: #f3f4f6; border: 2px dashed #d1d5db; border-radius: 16px; padding: 24px 48px;">
          <p style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #111827; margin: 0; font-family: monospace;">${data?.code || ""}</p>
        </div>
      </div>
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Bu kod <strong>${data?.expiresInMinutes || 15} dakika</strong> geçerlidir. Başkasıyla paylaşmayın.</p>`)}
      <p style="font-size: 14px; color: #6b7280; margin: 16px 0 0 0;">Bu değişikliği siz talep etmediyseniz bu e-postayı görmezden gelebilirsiniz; hesabınız etkilenmez.</p>
    `,
      "E-posta Değişikliği Doğrulama Kodu",
    ),

    "site-access-invite": wrapEmail(
      `
      ${titleBlock("Tarodan Erken Erişim Davetiniz")}
      ${greeting(data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Tarodan'ı herkesten önce keşfetmeniz için davet edildiniz. Aşağıdaki erişim kodunu sitedeki giriş ekranına yazmanız yeterli:</p>
      <div style="text-align: center; margin: 32px 0;">
        <div style="display: inline-block; background: #f3f4f6; border: 2px dashed #d1d5db; border-radius: 16px; padding: 24px 48px;">
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827; margin: 0; font-family: monospace;">${data?.code || ""}</p>
        </div>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siteye Git", frontendUrl)}
      </div>
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Bu kod size özeldir; başkasıyla paylaşmayın.</p>`)}
      <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0 0;">Görüşmek üzere!<br/><strong style="color: #f97316;">Tarodan Ekibi</strong></p>
    `,
      "Tarodan Erken Erişim Davetiniz",
    ),

    "invoice-buyer": wrapEmail(
      `
      ${titleBlock("Faturanız Hazır", "🧾")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Siparişinize ait fatura aşağıdaki bilgileri içermektedir.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Fatura No", data?.invoiceNumber || "")}
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Ürün", data?.productTitle || "")}
          ${detailRow("Satıcı", data?.sellerName || "")}
          ${detailRow("Toplam Tutar", formatEmailPrice(data?.totalAmount || 0) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", data?.invoiceUrl || `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
      <p style="font-size: 13px; color: #9ca3af; margin: 16px 0 0 0;">Fatura bilgileriniz yasal yükümlülükler gereği saklanmaktadır.</p>
    `,
      "Faturanız Hazır",
    ),

    "invoice-seller": wrapEmail(
      `
      ${titleBlock("Satış Faturanız Hazır", "🧾")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Bu siparişe ait satış faturanız aşağıda özetlenmiştir.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Fatura No", data?.invoiceNumber || "")}
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Ürün", data?.productTitle || "")}
          ${detailRow("Alıcı", data?.buyerName || "")}
          ${detailRow("Satış Tutarı", formatEmailPrice(data?.totalAmount || 0) + " TL")}
          ${detailRow("Platform Komisyonu", formatEmailPrice(data?.commissionAmount || 0) + " TL")}
          ${detailRow("Net Kazancınız", formatEmailPrice(Number(data?.totalAmount || 0) - Number(data?.commissionAmount || 0)) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/seller/orders/${data?.orderId || ""}`)}
      </div>
      <p style="font-size: 13px; color: #9ca3af; margin: 16px 0 0 0;">Fatura bilgileriniz yasal yükümlülükler gereği saklanmaktadır.</p>
    `,
      "Satış Faturanız Hazır",
    ),

    // eLogo e-Arşiv / e-Fatura — Tarodan'ın kestiği TÜM gelir belgeleri (komisyon, hizmet
    // bedeli, üyelik, boost, takas, platform satışı, iade) bu tek şablonu kullanır. PDF ektedir.
    "elogo-invoice": wrapEmail(
      `
      ${titleBlock("e-Arşiv Faturanız Hazır", "🧾")}
      ${greeting(data?.recipientName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        <strong>${data?.description || "İşleminize ait"}</strong> için e-Arşiv faturanız oluşturuldu.
        Fatura PDF'i bu e-postanın ekindedir.
      </p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Belge Türü", data?.description || "Fatura")}
          ${detailRow("Fatura No", data?.invoiceNumber || "")}
          ${detailRow("Tutar (KDV dahil)", formatEmailPrice(data?.total || 0) + " TL", true)}
        </table>
      `)}
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Faturanız ektedir. e-Arşiv faturalarınızı <a href="https://ebelgesorgulama.elogo.com.tr/" style="color: #b45309; font-weight: 600;">ebelgesorgulama.elogo.com.tr</a> üzerinden de görüntüleyebilirsiniz.</p>`)}
      <p style="font-size: 13px; color: #9ca3af; margin: 16px 0 0 0;">Fatura bilgileriniz yasal yükümlülükler gereği saklanmaktadır.</p>
    `,
      "e-Arşiv Faturanız Hazır",
    ),

    // Kurumsal satıcının siparişe yüklediği ÜRÜN faturası → ALICIYA (PDF ektedir).
    "seller-invoice": wrapEmail(
      `
      ${titleBlock("Satıcı Faturanız Hazır", "🧾")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        <strong>${data?.sellerName || "Satıcı"}</strong>, siparişinize ait faturayı yükledi. Fatura PDF'i bu e-postanın ekindedir.
      </p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${detailRow("Ürün", data?.productTitle || "")}
          ${detailRow("Satıcı", data?.sellerName || "")}
        </table>
      `)}
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Faturanız ektedir. Siparişlerim sayfasından da görüntüleyebilirsiniz.</p>`)}
    `,
      "Satıcı Faturanız Hazır",
    ),

    "order-cancelled-buyer": wrapEmail(
      `
      ${titleBlock("Siparişiniz İptal Edildi", "❌")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Aşağıdaki siparişiniz iptal edildi.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
          ${data?.refundAmount ? detailRow("İade Tutarı", formatEmailPrice(data.refundAmount) + " TL", true) : ""}
        </table>
      `)}
      ${data?.reason ? warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;"><strong>İptal nedeni:</strong> ${data.reason}</p>`) : ""}
      ${data?.refundAmount ? infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">İade tutarı ödeme yönteminize 3–5 iş günü içinde yansıyacaktır.</p>`) : ""}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Alışverişe Devam Et", `${frontendUrl}/listings`)}
      </div>
    `,
      "Siparişiniz İptal Edildi",
    ),

    "order-cancelled-seller": wrapEmail(
      `
      ${titleBlock("Sipariş İptal Edildi", "❌")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Ürününüze ait bir sipariş iptal edildi. Bu ürün için ayırdığınız stok serbest bırakıldı.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
        </table>
      `)}
      ${data?.reason ? warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;"><strong>İptal nedeni:</strong> ${data.reason}</p>`) : ""}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Satıcı Paneline Git", `${frontendUrl}/profile/orders?filter=seller`)}
      </div>
    `,
      "Sipariş İptal Edildi",
    ),

    "refund-requested-seller": wrapEmail(
      `
      ${titleBlock("İade Talebi Aldınız", "🔄")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Bir siparişiniz için alıcı iade talebinde bulundu. Lütfen talebi inceleyerek onaylayın veya itiraz edin.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
          ${data?.buyerName ? detailRow("Alıcı", data.buyerName) : ""}
          ${data?.refundAmount ? detailRow("Talep Edilen İade", formatEmailPrice(data.refundAmount) + " TL", true) : ""}
        </table>
      `)}
      ${data?.refundReason ? warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;"><strong>İade nedeni:</strong> ${data.refundReason}</p>`) : ""}
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Belirlenen süre içinde yanıt vermezseniz talep otomatik olarak işleme alınabilir.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("İade Talebini İncele", `${frontendUrl}/seller/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İade Talebi Aldınız",
    ),

    "refund-approved-buyer": wrapEmail(
      `
      ${titleBlock("İade Talebiniz Onaylandı", "✅")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">İade talebiniz onaylandı.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">İadeniz işleme alındı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
          ${detailRow("İade Tutarı", formatEmailPrice(data?.refundAmount || 0) + " TL", true)}
        </table>
      `)}
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">İade tutarı ödeme yönteminize 3–5 iş günü içinde yansıyacaktır.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İade Talebiniz Onaylandı",
    ),

    "refund-rejected-buyer": wrapEmail(
      `
      ${titleBlock("İade Talebiniz Hakkında", "ℹ️")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">İade talebiniz incelendi. Üzgünüz, talebiniz şu an için onaylanamadı.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
        </table>
      `)}
      ${data?.reason ? warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Red nedeni:</strong> ${data.reason}</p>`) : ""}
      <p style="font-size: 14px; color: #6b7280; margin: 16px 0;">Karara itiraz etmek veya daha fazla bilgi almak için destek ekibimizle iletişime geçebilirsiniz.</p>
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
      <p style="font-size: 14px; color: #6b7280; margin: 0;">Sorularınız için: <a href="mailto:destek@tarodan.com.tr" style="color: #d95700;">destek@tarodan.com.tr</a></p>
    `,
      "İade Talebiniz Hakkında",
    ),

    "refund-return-label-buyer": wrapEmail(
      `
      ${titleBlock("İade Kargo Bilgileri", "📦")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">İade talebiniz onaylandı. Ürünü aşağıdaki bilgilerle kargoya verebilirsiniz.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
          ${data?.returnTrackingNumber ? detailRow("İade Takip No", data.returnTrackingNumber, true) : ""}
          ${data?.cargoCompany ? detailRow("Kargo Firması", data.cargoCompany) : ""}
        </table>
      `)}
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Ürünü orijinal ambalajında, eksiksiz şekilde gönderdiğinizden emin olun. İadeniz, ürün satıcıya ulaştıktan sonra tamamlanacaktır.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton(data?.returnUrl ? "İade Etiketini Görüntüle" : "Siparişi Görüntüle", data?.returnUrl || `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İade Kargo Bilgileri",
    ),

    "refund-completed": wrapEmail(
      `
      ${titleBlock("İadeniz Tamamlandı", "💰")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">İade tutarınız ödeme yönteminize iade edildi. İşlem tamamlandı.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">İadeniz tamamlandı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
          ${detailRow("İade Tutarı", formatEmailPrice(data?.refundAmount || 0) + " TL", true)}
        </table>
      `)}
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">İade tutarı ödeme yönteminize 3–5 iş günü içinde yansır. Bankanıza bağlı olarak süre değişebilir.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Siparişi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İadeniz Tamamlandı",
    ),

    "refund-request-received-buyer": wrapEmail(
      `
      ${titleBlock("İade Talebiniz Alındı", "📨")}
      ${greeting(data?.buyerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">İade talebiniz alındı. Satıcının yanıtı bekleniyor; en geç 48 saat içinde sonuçlanır.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
          ${detailRow("İade Tutarı", formatEmailPrice(data?.refundAmount || 0) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Talebi Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İade Talebiniz Alındı",
    ),

    "refund-return-incoming-seller": wrapEmail(
      `
      ${titleBlock("İade Kargosu Yola Çıktı", "📦")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Alıcı iade ürününü kargoya verdi; ürün size doğru yolda. Ürün elinize ulaştığında iade süreci tamamlanacaktır.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
          ${data?.returnTrackingNumber ? detailRow("İade Takip No", data.returnTrackingNumber, true) : ""}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Satışı Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İade Kargosu Yola Çıktı",
    ),

    "refund-completed-seller": wrapEmail(
      `
      ${titleBlock("İade Tamamlandı", "↩️")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Bu sipariş için iade tamamlandı; tutar alıcıya iade edildi.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
          ${detailRow("İade Tutarı", formatEmailPrice(data?.refundAmount || 0) + " TL", true)}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Satışı Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İade Tamamlandı",
    ),

    "refund-auto-accepted-seller": wrapEmail(
      `
      ${titleBlock("İade Otomatik Onaylandı", "⏰")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">İade talebine 48 saat içinde yanıt verilmediği için talep otomatik olarak onaylandı.</p>
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">İade süreci başlatıldı. Ürün size iade kargosuyla gönderilecektir.</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Sipariş No", "#" + (data?.orderNumber || ""))}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Satışı Görüntüle", `${frontendUrl}/profile/orders/${data?.orderId || ""}`)}
      </div>
    `,
      "İade Otomatik Onaylandı",
    ),

    "review-received-seller": wrapEmail(
      `
      ${titleBlock("Yeni Değerlendirme Aldınız", "⭐")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;"><strong style="color: #111827;">${data?.reviewerName || "Bir alıcı"}</strong> sizi değerlendirdi.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${data?.rating != null ? detailRow("Puan", `${data.rating}/5`, true) : ""}
          ${data?.productTitle ? detailRow("Ürün", data.productTitle) : ""}
        </table>
        ${data?.comment ? `<p style="margin: 16px 0 0 0; font-size: 15px; color: #374151; font-style: italic;">"${data.comment}"</p>` : ""}
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Değerlendirmeyi Görüntüle", data?.reviewUrl || `${frontendUrl}/profile/statistics`)}
      </div>
    `,
      "Yeni Değerlendirme Aldınız",
    ),

    "listing-expiring": wrapEmail(
      `
      ${titleBlock("İlanınızın Süresi Doluyor", "⏰")}
      ${greeting(data?.sellerName || data?.userName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;"><strong style="color: #111827;">${data?.productTitle || "İlanınızın"}</strong> ilanının süresi ${data?.daysRemaining ? `${data.daysRemaining} gün içinde ` : "yakında "}dolacak. Yenileyerek görünürlüğünü koruyabilirsiniz.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("İlan", data?.productTitle || "")}
          ${data?.expirationDate ? detailRow("Bitiş Tarihi", String(data.expirationDate), true) : ""}
        </table>
      `)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("İlanı Yenile", data?.listingUrl || `${frontendUrl}/profile/listings`)}
      </div>
    `,
      "İlanınızın Süresi Doluyor",
    ),

    "listing-expired": wrapEmail(
      `
      ${titleBlock("İlanınızın Süresi Doldu", "📭")}
      ${greeting(data?.sellerName || data?.userName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;"><strong style="color: #111827;">${data?.productTitle || "İlanınızın"}</strong> ilanının süresi doldu ve yayından kaldırıldı. Tekrar yayınlayarak alıcılarla buluşmaya devam edebilirsiniz.</p>
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">İlanınızı birkaç tıklamayla yeniden yayınlayabilirsiniz.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("İlanı Yeniden Yayınla", data?.listingUrl || `${frontendUrl}/profile/listings`)}
      </div>
    `,
      "İlanınızın Süresi Doldu",
    ),

    "new-follower": wrapEmail(
      `
      ${titleBlock("Yeni Takipçiniz Var", "👥")}
      ${greeting(data?.name || data?.userName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;"><strong style="color: #111827;">${data?.followerName || "Yeni bir kullanıcı"}</strong> sizi takip etmeye başladı. Profilinizdeki yeni ilanlar takipçilerinize bildirilir.</p>
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Takipçiyi Görüntüle", data?.followerUrl || `${frontendUrl}/profile`)}
      </div>
    `,
      "Yeni Takipçiniz Var",
    ),

    "back-in-stock": wrapEmail(
      `
      ${titleBlock("Stoğa Geri Geldi!", "🔔")}
      ${greeting(data?.userName || data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Takip ettiğiniz <strong style="color: #111827;">${data?.productTitle || "ürün"}</strong> yeniden stokta! Tükenmeden hemen inceleyin.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Ürün tekrar satışta</p>`)}
      ${
        data?.price
          ? detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Ürün", data?.productTitle || "")}
          ${detailRow("Fiyat", formatEmailPrice(data.price) + " TL", true)}
        </table>
      `)
          : ""
      }
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Ürünü İncele", data?.productUrl || frontendUrl)}
      </div>
    `,
      "Stoğa Geri Geldi!",
    ),

    "payout-released-seller": wrapEmail(
      `
      ${titleBlock("Ödemeniz Aktarıldı", "💸")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Tebrikler! Bir satışınıza ait ödeme banka hesabınıza aktarıldı.</p>
      ${successBox(`<p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">Ödeme aktarımı tamamlandı</p>`)}
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${data?.orderNumber ? detailRow("Sipariş No", "#" + data.orderNumber) : ""}
          ${detailRow("Aktarılan Tutar", formatEmailPrice(data?.payoutAmount || 0) + " TL", true)}
          ${data?.bankAccountLast4 ? detailRow("Hesap", "•••• " + data.bankAccountLast4) : ""}
          ${data?.payoutDate ? detailRow("Aktarım Tarihi", String(data.payoutDate)) : ""}
        </table>
      `)}
      ${infoBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Tutarın hesabınıza geçmesi bankanıza bağlı olarak 1–2 iş günü sürebilir.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Kazançlarımı Görüntüle", `${frontendUrl}/profile/statistics`)}
      </div>
    `,
      "Ödemeniz Aktarıldı",
    ),

    "payout-returned-seller": wrapEmail(
      `
      ${titleBlock("Ödemeniz Geri Döndü", "⚠️")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Size gönderdiğimiz ödeme, bankanız tarafından geri gönderildi. Bu genellikle IBAN'ın kapalı, bloke veya hatalı olmasından kaynaklanır. Tutar güvende — banka bilgileriniz güncellendikten sonra yeniden aktarılacak.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Tutar", formatEmailPrice(data?.payoutAmount || 0) + " TL", true)}
          ${data?.bankAccountLast4 ? detailRow("Hesap", "•••• " + data.bankAccountLast4) : ""}
          ${data?.failureReason ? detailRow("Banka açıklaması", String(data.failureReason)) : ""}
        </table>
      `)}
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Lütfen profilinizden IBAN bilgilerinizi kontrol edip güncelleyin; aktarım sonrasında yeniden denenecektir.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Banka Bilgilerimi Güncelle", `${frontendUrl}/profile`)}
      </div>
    `,
      "Ödemeniz Geri Döndü",
    ),

    "payout-failed-seller": wrapEmail(
      `
      ${titleBlock("Ödemeniz Aktarılamadı", "⚠️")}
      ${greeting(data?.sellerName)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Bir satışınıza ait ödeme, banka hesabınıza aktarılamadı. Tutar güvende — banka bilgileriniz doğrulandıktan sonra yeniden aktarılacak.</p>
      ${detailsBox(`
        <table width="100%" cellspacing="0" cellpadding="0">
          ${detailRow("Tutar", formatEmailPrice(data?.payoutAmount || 0) + " TL", true)}
          ${data?.bankAccountLast4 ? detailRow("Hesap", "•••• " + data.bankAccountLast4) : ""}
        </table>
      `)}
      ${warningBox(`<p style="margin: 0; font-size: 14px; color: #92400e;">Lütfen profilinizden IBAN ve hesap sahibi bilgilerinizin doğru olduğundan emin olun. Sorun devam ederse destek ekibimizle iletişime geçin.</p>`)}
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton("Banka Bilgilerimi Güncelle", `${frontendUrl}/profile`)}
      </div>
    `,
      "Ödemeniz Aktarılamadı",
    ),
  };

  const rendered = templates[template];
  if (rendered) return rendered;

  return wrapEmail(
    `
    ${titleBlock("Tarodan Bildirimi", "🔔")}
    ${greeting(data?.buyerName || data?.sellerName || data?.userName || data?.name)}
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">Hesabınızla ilgili yeni bir bildiriminiz var.</p>
    <div style="text-align: center; margin: 32px 0;">
      ${primaryButton("Hesabıma Git", frontendUrl)}
    </div>
  `,
    "Tarodan Bildirim",
  );
}
