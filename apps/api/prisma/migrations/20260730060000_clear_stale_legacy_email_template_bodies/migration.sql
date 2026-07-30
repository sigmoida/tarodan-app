-- The key-normalization migration (20260729210000) carried legacy seeded
-- template bodies over to the canonical keys to preserve possible admin
-- customizations. But those bodies are themselves old seed defaults whose
-- variable names ({{displayName}}, {{amount}}, {{orderUrl}}, ...) no longer
-- match the data the application sends, so they render as raw placeholders.
--
-- Blank out subject/body ONLY where the body is byte-identical to a known
-- legacy seed default (provably not admin-authored). An empty body makes the
-- renderer fall back to the branded default template in code. Bodies an admin
-- actually edited are left untouched.
UPDATE email_templates AS t
SET subject = '',
    body_html = '',
    variables_json = '[]',
    updated_at = NOW()
FROM (
  VALUES
    ('welcome', $b$<h1>Merhaba {{displayName}},</h1>
<p>Tarodan ailesine hoş geldiniz! Artık diecast model araba koleksiyonunuzu büyütmeye hazırsınız.</p>
<p>Başlamak için: <a href="{{frontendUrl}}/listings">İlanları Keşfet</a></p>
<p>İyi koleksiyonlar,<br>Tarodan Ekibi</p>$b$),
    ('email-verification', $b$<h1>E-posta Doğrulama</h1>
<p>Merhaba {{displayName}},</p>
<p>Hesabınızı doğrulamak için aşağıdaki bağlantıya tıklayın:</p>
<p><a href="{{verificationUrl}}">E-postamı Doğrula</a></p>
<p>Bu bağlantı 24 saat geçerlidir. Talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>$b$),
    ('password-reset', $b$<h1>Şifre Sıfırlama</h1>
<p>Merhaba {{displayName}},</p>
<p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
<p><a href="{{resetUrl}}">Şifremi Sıfırla</a></p>
<p>Bu bağlantı 1 saat geçerlidir. Talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>$b$),
    ('order-confirmation', $b$<h1>Siparişiniz Alındı!</h1>
<p>Merhaba {{buyerName}},</p>
<p><strong>#{{orderNumber}}</strong> numaralı siparişiniz başarıyla oluşturuldu.</p>
<p>Ürün: {{productTitle}}</p>
<p>Tutar: {{amount}} TL</p>
<p>Sipariş durumunuzu takip etmek için: <a href="{{orderUrl}}">Siparişimi Görüntüle</a></p>$b$),
    ('order-shipped', $b$<h1>Siparişiniz Yola Çıktı!</h1>
<p>Merhaba {{buyerName}},</p>
<p><strong>#{{orderNumber}}</strong> numaralı siparişiniz kargoya verildi.</p>
<p>Kargo Firması: Sürat Kargo</p>
<p>Takip No: <strong>{{trackingNumber}}</strong></p>
<p><a href="{{trackingUrl}}">Kargomu Takip Et</a></p>$b$),
    ('offer-received', $b$<h1>Yeni Teklif!</h1>
<p>Merhaba {{sellerName}},</p>
<p><strong>{{buyerName}}</strong> adlı kullanıcı <strong>{{productTitle}}</strong> ilanınıza <strong>{{offerAmount}} TL</strong> teklif verdi.</p>
<p><a href="{{offerUrl}}">Teklifi İncele</a></p>$b$),
    ('trade-received', $b$<h1>Takas Talebi</h1>
<p>Merhaba {{sellerName}},</p>
<p><strong>{{requesterName}}</strong> adlı kullanıcı <strong>{{productTitle}}</strong> ilanınız için takas teklif etti.</p>
<p><a href="{{tradeUrl}}">Takası İncele</a></p>$b$),
    ('payout-released-seller', $b$<h1>Ödemeniz Gönderildi</h1>
<p>Merhaba {{sellerName}},</p>
<p><strong>{{amount}} TL</strong> tutarındaki satış geliriniz IBAN'ınıza aktarıldı.</p>
<p>İşlem Tarihi: {{date}}</p>$b$)
) AS legacy(key, body_html)
WHERE t.key = legacy.key
  AND t.body_html = legacy.body_html;
