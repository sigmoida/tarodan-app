/**
 * Invoice e-posta gövde renderer'ları (saf / pure)
 *
 * Alıcı ve satıcı fatura e-postalarının HTML'ini üreten, bağımlılıksız saf
 * fonksiyonlar. InvoiceService'ten `this` bağı olmadan çıkarıldı
 * (common/helpers/email-template-renderer deseni). Çıktı yalnızca `data`
 * argümanına bağlıdır; DI yok, sınıf yok. Üretilen HTML birebir korunur.
 */

/**
 * Generate invoice email HTML for buyer
 */
export function generateInvoiceEmailHtml(data: {
    buyerName: string;
    invoiceNumber: string;
    orderNumber: string;
    productTitle: string;
    totalAmount: number;
    sellerName: string;
    invoiceUrl: string;
    orderId: string;
    frontendUrl: string;
}): string {
    const formatPrice = (amount: number) =>
      new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #e63946 0%, #1d3557 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Taro<span style="color: #f1faee;">dan</span></h1>
              <p style="color: #f1faee; margin: 10px 0 0 0; font-size: 14px;">Diecast Koleksiyoncuları Platformu</p>
            </td>
          </tr>

          <!-- Invoice Icon -->
          <tr>
            <td style="padding: 30px 40px 20px 40px; text-align: center;">
              <div style="background-color: #e8f5e9; border-radius: 50%; width: 80px; height: 80px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span style="font-size: 40px;">📄</span>
              </div>
              <h2 style="color: #1d3557; margin: 0; font-size: 24px;">Faturanız Hazır!</h2>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                Merhaba <strong>${data.buyerName}</strong>,
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">
                Siparişiniz için faturanız oluşturuldu. Fatura detayları aşağıda yer almaktadır.
              </p>

              <!-- Invoice Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Fatura No:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.invoiceNumber}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Sipariş No:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.orderNumber}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Ürün:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.productTitle}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Satıcı:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.sellerName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0 0 0;">
                          <span style="color: #333; font-size: 16px; font-weight: bold;">Toplam Tutar:</span>
                        </td>
                        <td style="padding: 12px 0 0 0; text-align: right;">
                          <strong style="color: #28a745; font-size: 20px;">${formatPrice(data.totalAmount)} ₺</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info Note -->
              <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                <p style="color: #1565c0; margin: 0; font-size: 14px;">
                  📋 <strong>Bilgi:</strong> Fatura detaylarınız yukarıda yer almaktadır. Siparişinizi takip etmek için aşağıdaki butona tıklayabilirsiniz.
                </p>
              </div>

              <!-- CTA Button (invoiceUrl is track page for guest, orders/[id] for member) -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${data.invoiceUrl}" 
                       style="display: inline-block; background-color: #e63946; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Siparişi Takip Et
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #1d3557; padding: 25px 40px; text-align: center;">
              <p style="color: #f1faee; margin: 0 0 10px 0; font-size: 14px;">
                <strong>Tarodan Marketplace</strong>
              </p>
              <p style="color: #a8dadc; margin: 0; font-size: 12px;">
                İstanbul, Türkiye | info@tarodan.com
              </p>
              <p style="color: #457b9d; margin: 15px 0 0 0; font-size: 11px;">
                Bu e-posta otomatik olarak oluşturulmuştur. Lütfen yanıtlamayınız.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
}

/**
 * Generate invoice email HTML for seller
 */
export function generateSellerInvoiceEmailHtml(data: {
    sellerName: string;
    invoiceNumber: string;
    orderNumber: string;
    productTitle: string;
    totalAmount: number;
    commissionAmount: number;
    buyerName: string;
    frontendUrl: string;
    orderId: string;
}): string {
    const formatPrice = (amount: number) =>
      new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

    const netAmount = data.totalAmount - data.commissionAmount;

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #e63946 0%, #1d3557 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Taro<span style="color: #f1faee;">dan</span></h1>
              <p style="color: #f1faee; margin: 10px 0 0 0; font-size: 14px;">Satıcı Faturası</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                Merhaba <strong>${data.sellerName}</strong>,
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">
                Satışınız için fatura oluşturuldu. Kayıtlarınız için saklayabilirsiniz.
              </p>

              <!-- Invoice Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Fatura No:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.invoiceNumber}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Sipariş No:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.orderNumber}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Ürün:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.productTitle}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Alıcı:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.buyerName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Satış Tutarı:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${formatPrice(data.totalAmount)} ₺</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Platform Komisyonu:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #dc3545; font-size: 14px;">-${formatPrice(data.commissionAmount)} ₺</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0 0 0;">
                          <span style="color: #333; font-size: 16px; font-weight: bold;">Net Kazancınız:</span>
                        </td>
                        <td style="padding: 12px 0 0 0; text-align: right;">
                          <strong style="color: #28a745; font-size: 20px;">${formatPrice(netAmount)} ₺</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info Note -->
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  ⏰ <strong>Hatırlatma:</strong> Ödemeniz, alıcı ürünü teslim aldıktan 14 gün sonra hesabınıza aktarılacaktır.
                </p>
              </div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${data.frontendUrl}/seller/orders/${data.orderId}" 
                       style="display: inline-block; background-color: #1d3557; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Siparişi Görüntüle
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #1d3557; padding: 25px 40px; text-align: center;">
              <p style="color: #f1faee; margin: 0 0 10px 0; font-size: 14px;">
                <strong>Tarodan Marketplace</strong>
              </p>
              <p style="color: #a8dadc; margin: 0; font-size: 12px;">
                İstanbul, Türkiye | info@tarodan.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
}
