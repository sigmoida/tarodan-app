/** Per-template sample data used for editor preview + test emails. */
export const SAMPLE_DATA: Record<string, Record<string, unknown>> = {
  // Hesap
  welcome: { name: 'Örnek Kullanıcı', verifyUrl: 'https://tarodan.com/verify?token=sample' },
  'email-verification': { name: 'Örnek Kullanıcı', verificationUrl: 'https://tarodan.com/verify?token=sample', expiresIn: '24 saat' },
  'password-reset': { name: 'Örnek Kullanıcı', resetUrl: 'https://tarodan.com/reset?token=sample' },
  // Sipariş
  'order-confirmation': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', totalAmount: 199.99 },
  'order-created-buyer': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', totalAmount: 199.99 },
  'order-created-seller': { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', totalAmount: 199.99 },
  'order-paid': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', totalAmount: 199.99, transactionId: 'TXN-999', paymentMethod: 'Kredi Kartı' },
  'order-paid-seller': { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', totalAmount: 199.99, commissionAmount: 20, netAmount: 179.99 },
  'order-shipped': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', trackingNumber: '1234567890', provider: 'Sürat Kargo' },
  'order-delivered': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id' },
  // Ödeme
  'payment-received': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', amount: 199.99 },
  'payment-failed': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', amount: 199.99, failureReason: 'Kart limiti yetersiz' },
  'payment-refunded': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', refundAmount: 199.99 },
  'payment-refunded-seller': { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', refundAmount: 179.99 },
  // Teklif
  'offer-received': { sellerName: 'Satıcı', productTitle: 'Hot Wheels Ferrari 458', offerAmount: 150, buyerName: 'Alıcı', productPrice: 200 },
  'offer-accepted': { buyerName: 'Alıcı', productTitle: 'Hot Wheels Ferrari 458', offerAmount: 150, orderNumber: 'TRD-12345', sellerName: 'Satıcı', orderId: 'sample-id' },
  // Ürün
  'product-approved': { sellerName: 'Satıcı', productTitle: 'Hot Wheels Ferrari 458', productUrl: 'https://tarodan.com/products/sample' },
  'wishlist-price-change': { userName: 'Kullanıcı', productTitle: 'Hot Wheels Ferrari 458', oldPrice: 200, newPrice: 180, isPriceDrop: true, productUrl: 'https://tarodan.com/products/sample' },
  // Üyelik
  'premium-offer': { userName: 'Kullanıcı', benefits: ['Sınırsız ilan', 'Öne çıkarma kredisi', 'Özel rozet'], ctaText: 'Premium Üye Ol' },
  'membership-expiring': { userName: 'Kullanıcı', tierName: 'Premium', daysRemaining: 7, expirationDate: '2024-12-31' },
  'membership-expiring-urgent': { userName: 'Kullanıcı', tierName: 'Premium', expirationDate: '2024-12-24' },
  // Pazarlama
  'marketing-newsletter': { userName: 'Kullanıcı', trendingProducts: [{ title: 'Hot Wheels Ferrari 458', price: 199, productUrl: 'https://tarodan.com/products/1' }] },
  'marketing-monthly': { userName: 'Kullanıcı', featuredProducts: [{ title: 'Matchbox BMW M3', price: 149, productUrl: 'https://tarodan.com/products/2' }] },
  // İş Başvurusu
  'seller-application-approved': { name: 'Ahmet Yılmaz', companyName: 'Örnek Ticaret A.Ş.' },
  'seller-application-rejected': { name: 'Ahmet Yılmaz', reason: 'Sağlanan belgeler eksik veya okunamaz durumda. Lütfen şirket kaşesi ve imzalı güncel vergi levhanızı yükleyerek tekrar başvurun.' },
  // İade (satıcı kargoya vermedi)
  'seller-did-not-ship-refunded': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', refundAmount: 199.99 },
  // Takas
  'trade-received': { name: 'Kullanıcı', tradeId: 'sample-trade', tradeUrl: 'https://tarodan.com/trades/sample-trade' },
  'trade-accepted': { name: 'Kullanıcı', tradeUrl: 'https://tarodan.com/trades/sample-trade' },
  'trade-shipped': { name: 'Kullanıcı', trackingNumber: '1234567890', tradeUrl: 'https://tarodan.com/trades/sample-trade' },
  'trade-completed': { name: 'Kullanıcı', tradeUrl: 'https://tarodan.com/trades/sample-trade' },
  // Misafir
  'guest-checkout-otp': { code: '482913', expiresInMinutes: 10 },
  // Fatura
  'elogo-invoice': { recipientName: 'Değerli Müşterimiz', description: 'Aracılık hizmet (komisyon) bedeli', invoiceNumber: 'TRD2026000000012', total: 450.77, type: 'commission' },
  'seller-invoice': { buyerName: 'Alıcı', sellerName: 'ABC Diecast Ltd.', orderNumber: 'TRD-12345', productTitle: 'Hot Wheels Ferrari 458' },
  'invoice-buyer': { buyerName: 'Alıcı', invoiceNumber: 'FT-2024-001', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', sellerName: 'Satıcı', totalAmount: 199.99 },
  'invoice-seller': { sellerName: 'Satıcı', invoiceNumber: 'FT-2024-002', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', buyerName: 'Alıcı', totalAmount: 199.99, commissionAmount: 20 },
  // Sipariş iptali
  'order-cancelled-buyer': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', refundAmount: 199.99, reason: 'Satıcı ürünü stoktan kaldırdı' },
  'order-cancelled-seller': { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', reason: 'Alıcı talebi' },
  // İade akışı
  'refund-requested-seller': { sellerName: 'Satıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', buyerName: 'Alıcı', refundAmount: 199.99, refundReason: 'Ürün açıklamayla uyuşmuyor' },
  'refund-approved-buyer': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', refundAmount: 199.99 },
  'refund-rejected-buyer': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', reason: 'Ürün kullanılmış olarak iade edilmek isteniyor' },
  'refund-return-label-buyer': { buyerName: 'Alıcı', orderNumber: 'TRD-12345', orderId: 'sample-id', productTitle: 'Hot Wheels Ferrari 458', returnTrackingNumber: '9876543210', cargoCompany: 'Sürat Kargo', returnUrl: 'https://tarodan.com/orders/sample-id/return' },
  // Değerlendirme
  'review-received-seller': { sellerName: 'Satıcı', reviewerName: 'Alıcı', rating: 5, productTitle: 'Hot Wheels Ferrari 458', comment: 'Hızlı kargo, ürün birebir açıklandığı gibi. Teşekkürler!', reviewUrl: 'https://tarodan.com/seller/reviews' },
  // İlan & Stok
  'listing-expiring': { sellerName: 'Satıcı', productTitle: 'Hot Wheels Ferrari 458', daysRemaining: 3, expirationDate: '2024-12-31', listingUrl: 'https://tarodan.com/seller/listings' },
  'listing-expired': { sellerName: 'Satıcı', productTitle: 'Hot Wheels Ferrari 458', listingUrl: 'https://tarodan.com/seller/listings' },
  'back-in-stock': { userName: 'Kullanıcı', productTitle: 'Hot Wheels Ferrari 458', price: 199.99, productUrl: 'https://tarodan.com/products/sample' },
  // Sosyal
  'new-follower': { name: 'Kullanıcı', followerName: 'Ayşe D.', followerUrl: 'https://tarodan.com/profile/followers' },
  // Ödeme aktarımı
  'payout-released-seller': { sellerName: 'Satıcı', orderNumber: 'TRD-12345', payoutAmount: 179.99, bankAccountLast4: '4242', payoutDate: '2024-12-20' },
};
