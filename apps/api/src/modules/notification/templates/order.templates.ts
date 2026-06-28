/**
 * Order Email Templates
 * 
 * Templates for order-related notifications
 */

import { baseTemplate } from './base.template';

export interface OrderData {
  orderNumber: string;
  customerName: string;
  productTitle: string;
  productImage?: string;
  productPrice: number;
  shippingCost?: number;
  totalAmount: number;
  sellerName: string;
  shippingAddress?: {
    fullName: string;
    address: string;
    city: string;
    phone: string;
  };
  trackingNumber?: string;
  trackingUrl?: string;
  orderUrl: string;
}

/**
 * Order Confirmation Template
 */
export const orderConfirmationTemplate = (data: OrderData): string => {
  const content = `
    <h1>Siparişiniz Oluşturuldu! 🎉</h1>
    <p>Merhaba ${data.customerName},</p>
    <p>Siparişiniz başarıyla oluşturuldu ve ödeme bekleniyor. Aşağıda sipariş detaylarınızı bulabilirsiniz:</p>
    
    <div class="info-box">
      <p><strong>Sipariş No:</strong> ${data.orderNumber}</p>
      <p><strong>Satıcı:</strong> ${data.sellerName}</p>
    </div>
    
    <div class="divider"></div>
    
    <h2>Sipariş Detayı</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
      <tr>
        <td style="width: 100px;">
          ${data.productImage 
            ? `<img src="${data.productImage}" alt="${data.productTitle}" style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover;">` 
            : '<div style="width: 80px; height: 80px; background-color: #f1f5f9; border-radius: 8px;"></div>'}
        </td>
        <td style="padding-left: 16px; vertical-align: middle;">
          <p style="margin: 0 0 8px; font-weight: bold;">${data.productTitle}</p>
          <p style="margin: 0;" class="price">₺${data.productPrice.toLocaleString('tr-TR')}</p>
        </td>
      </tr>
    </table>
    
    <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <table width="100%">
        <tr>
          <td style="padding: 4px 0;">Ürün Tutarı:</td>
          <td style="text-align: right;">₺${data.productPrice.toLocaleString('tr-TR')}</td>
        </tr>
        ${data.shippingCost ? `
        <tr>
          <td style="padding: 4px 0;">Kargo:</td>
          <td style="text-align: right;">₺${data.shippingCost.toLocaleString('tr-TR')}</td>
        </tr>
        ` : ''}
        <tr style="border-top: 1px solid #e5e7eb;">
          <td style="padding: 8px 0; font-weight: bold;">Toplam:</td>
          <td style="text-align: right; font-weight: bold; color: #e94560;">₺${data.totalAmount.toLocaleString('tr-TR')}</td>
        </tr>
      </table>
    </div>
    
    <div class="highlight">
      <p style="margin: 0;"><strong>⚠️ Önemli:</strong> Siparişinizi tamamlamak için ödeme yapmanız gerekmektedir. Ödeme 24 saat içinde yapılmazsa siparişiniz iptal edilecektir.</p>
    </div>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.orderUrl}" class="button">Ödeme Yap</a>
    </div>
    
    <p>Herhangi bir sorunuz varsa, <a href="mailto:destek@tarodan.com">destek@tarodan.com</a> adresinden bize ulaşabilirsiniz.</p>
  `;

  return baseTemplate(content, { previewText: `Siparişiniz oluşturuldu: ${data.orderNumber}` });
};

/**
 * Order Paid Template
 */
export const orderPaidTemplate = (data: OrderData): string => {
  const content = `
    <h1>Ödeme Alındı! ✅</h1>
    <p>Merhaba ${data.customerName},</p>
    <p><strong>${data.orderNumber}</strong> numaralı siparişiniz için ödeme başarıyla alındı. Satıcı siparişinizi en kısa sürede hazırlayacaktır.</p>
    
    <div class="info-box success-highlight">
      <p style="margin: 0;"><strong>✓ Ödeme Onaylandı</strong></p>
      <p style="margin: 8px 0 0;">Sipariş No: ${data.orderNumber}</p>
    </div>
    
    <div class="divider"></div>
    
    <h2>Sipariş Özeti</h2>
    <p><strong>Ürün:</strong> ${data.productTitle}</p>
    <p><strong>Tutar:</strong> ₺${data.totalAmount.toLocaleString('tr-TR')}</p>
    <p><strong>Satıcı:</strong> ${data.sellerName}</p>
    
    ${data.shippingAddress ? `
    <div class="divider"></div>
    <h2>Teslimat Adresi</h2>
    <p style="margin: 0;">${data.shippingAddress.fullName}</p>
    <p style="margin: 4px 0;">${data.shippingAddress.address}</p>
    <p style="margin: 4px 0;">${data.shippingAddress.city}</p>
    <p style="margin: 4px 0;">${data.shippingAddress.phone}</p>
    ` : ''}
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.orderUrl}" class="button">Siparişi Görüntüle</a>
    </div>
    
    <p>Siparişiniz kargoya verildiğinde size bildirim göndereceğiz.</p>
  `;

  return baseTemplate(content, { previewText: `Ödemeniz alındı - Sipariş: ${data.orderNumber}` });
};

/**
 * Order Shipped Template
 */
export const orderShippedTemplate = (data: OrderData): string => {
  const content = `
    <h1>Siparişiniz Kargoya Verildi! 📦</h1>
    <p>Merhaba ${data.customerName},</p>
    <p>Harika haberler! <strong>${data.orderNumber}</strong> numaralı siparişiniz kargoya verildi ve size doğru yola çıktı.</p>
    
    ${data.trackingNumber ? `
    <div class="info-box">
      <p style="margin: 0; text-align: center;"><strong>Kargo Takip Numarası</strong></p>
      <div class="tracking-number">${data.trackingNumber}</div>
      ${data.trackingUrl ? `
      <div style="text-align: center;">
        <a href="${data.trackingUrl}" style="color: #e94560;">Kargoyu Takip Et →</a>
      </div>
      ` : ''}
    </div>
    ` : ''}
    
    <div class="divider"></div>
    
    <h2>Sipariş Bilgileri</h2>
    <p><strong>Ürün:</strong> ${data.productTitle}</p>
    <p><strong>Satıcı:</strong> ${data.sellerName}</p>
    
    ${data.shippingAddress ? `
    <h2>Teslimat Adresi</h2>
    <p style="margin: 0;">${data.shippingAddress.fullName}</p>
    <p style="margin: 4px 0;">${data.shippingAddress.address}</p>
    <p style="margin: 4px 0;">${data.shippingAddress.city}</p>
    ` : ''}
    
    <div class="highlight">
      <p style="margin: 0;"><strong>💡 İpucu:</strong> Siparişiniz teslim edildikten sonra 14 gün içinde koşulsuz iade hakkınız vardır.</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.orderUrl}" class="button">Siparişi Görüntüle</a>
    </div>
  `;

  return baseTemplate(content, { previewText: `Siparişiniz yola çıktı! Takip No: ${data.trackingNumber}` });
};

/**
 * Order Delivered Template
 */
export const orderDeliveredTemplate = (data: OrderData): string => {
  const content = `
    <h1>Siparişiniz Teslim Edildi! 🎁</h1>
    <p>Merhaba ${data.customerName},</p>
    <p><strong>${data.orderNumber}</strong> numaralı siparişiniz teslim edildi.</p>
    
    <div class="info-box success-highlight">
      <p style="margin: 0;"><strong>✓ Teslim Edildi</strong></p>
    </div>
    
    <div class="divider"></div>

    <h2>14 Gün Koşulsuz İade Hakkınız Var</h2>
    <p>Siparişiniz teslim edildi. Teslim tarihinden itibaren 14 gün içinde sebep belirtmeden iade talebinde bulunabilirsiniz. Süre dolunca siparişiniz otomatik olarak tamamlanır.</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.orderUrl}" class="button button--success">Siparişi Görüntüle</a>
    </div>
  `;

  return baseTemplate(content, { previewText: `Siparişiniz teslim edildi` });
};

/**
 * Order Completed Template
 */
export const orderCompletedTemplate = (data: OrderData): string => {
  const content = `
    <h1>Sipariş Tamamlandı! 🎉</h1>
    <p>Merhaba ${data.customerName},</p>
    <p><strong>${data.orderNumber}</strong> numaralı siparişiniz başarıyla tamamlandı. Tarodan'ı tercih ettiğiniz için teşekkür ederiz!</p>
    
    <div class="info-box success-highlight">
      <p style="margin: 0;"><strong>✓ İşlem Tamamlandı</strong></p>
      <p style="margin: 8px 0 0;">Ürün: ${data.productTitle}</p>
    </div>
    
    <div class="divider"></div>
    
    <h2>Deneyiminizi Değerlendirin</h2>
    <p>Satıcıyı değerlendirmek ister misiniz? Yorumunuz diğer kullanıcılara yardımcı olacaktır.</p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.orderUrl}/review" class="button">Değerlendir</a>
    </div>
    
    <p>Koleksiyonunuza eklemek için yeni ürünlere göz atmayı unutmayın!</p>
    
    <div style="text-align: center; margin: 16px 0;">
      <a href="https://tarodan.com/products" style="color: #e94560;">Yeni Ürünlere Göz At →</a>
    </div>
  `;

  return baseTemplate(content, { previewText: `Siparişiniz tamamlandı! Değerlendirmeyi unutmayın.` });
};
