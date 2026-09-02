/** Per-template sample data used for editor preview + test emails. */
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export const sampleData = (t: T): Record<string, Record<string, unknown>> => ({
  // Account
  welcome: {
    name: t("admin.marketing.emailTemplates.sample.user"),
    verifyUrl: "https://tarodan.com.tr/verify?token=sample",
  },
  "email-verification": {
    name: t("admin.marketing.emailTemplates.sample.user"),
    verificationUrl: "https://tarodan.com.tr/verify?token=sample",
    expiresIn: t("admin.marketing.emailTemplates.sample.twentyFourHours"),
  },
  "password-reset": {
    name: t("admin.marketing.emailTemplates.sample.user"),
    resetUrl: "https://tarodan.com.tr/reset?token=sample",
  },
  "email-change-otp": {
    code: "482913",
    expiresInMinutes: 15,
  },
  // Order
  "order-confirmation": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    totalAmount: 199.99,
  },
  "order-created-buyer": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    totalAmount: 199.99,
  },
  "order-created-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    totalAmount: 199.99,
  },
  "order-paid": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    totalAmount: 199.99,
    transactionId: "TXN-999",
    paymentMethod: t("admin.marketing.emailTemplates.sample.creditCard"),
  },
  "order-paid-group": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    groupNumber: "GRP-12345",
    groupTotal: 449.98,
    transactionId: "TXN-999",
    paymentMethod: t("admin.marketing.emailTemplates.sample.creditCard"),
    items: [
      {
        productTitle: "Hot Wheels Ferrari 458",
        quantity: 1,
        totalAmount: 199.99,
        shippingCost: 0,
      },
      {
        productTitle: "Matchbox BMW M3",
        quantity: 2,
        totalAmount: 249.99,
        shippingCost: 29.99,
      },
    ],
    sellerShipments: [
      {
        sellerName: t("admin.marketing.emailTemplates.sample.seller"),
        shippingCost: 29.99,
      },
    ],
  },
  "order-paid-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    totalAmount: 199.99,
    commissionAmount: 20,
    netAmount: 179.99,
  },
  "order-shipped": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    trackingNumber: "1234567890",
    provider: t("admin.marketing.emailTemplates.sample.cargoCompany"),
  },
  "order-delivered": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
  },
  // Payment
  "payment-received": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    amount: 199.99,
  },
  "payment-failed": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    amount: 199.99,
    failureReason: t("admin.marketing.emailTemplates.sample.insufficientLimit"),
  },
  "payment-refunded": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    refundAmount: 199.99,
  },
  "payment-refunded-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    refundAmount: 179.99,
  },
  // Offer
  "offer-received": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    productTitle: "Hot Wheels Ferrari 458",
    offerAmount: 150,
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    productPrice: 200,
  },
  "offer-accepted": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    productTitle: "Hot Wheels Ferrari 458",
    offerAmount: 150,
    orderNumber: "TRD-12345",
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderId: "sample-id",
  },
  // Product
  "product-approved": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    productTitle: "Hot Wheels Ferrari 458",
    productUrl: "https://tarodan.com.tr/products/sample",
  },
  "wishlist-price-change": {
    userName: t("admin.marketing.emailTemplates.sample.userShort"),
    productTitle: "Hot Wheels Ferrari 458",
    oldPrice: 200,
    newPrice: 180,
    isPriceDrop: true,
    productUrl: "https://tarodan.com.tr/products/sample",
  },
  // Membership
  "premium-offer": {
    userName: t("admin.marketing.emailTemplates.sample.userShort"),
    benefits: [
      t("admin.marketing.emailTemplates.sample.unlimitedListings"),
      t("admin.marketing.emailTemplates.sample.promotionCredit"),
      t("admin.marketing.emailTemplates.sample.specialBadge"),
    ],
    ctaText: t("admin.marketing.emailTemplates.sample.joinPremium"),
  },
  "membership-expiring": {
    userName: t("admin.marketing.emailTemplates.sample.userShort"),
    tierName: "Premium",
    daysRemaining: 7,
    expirationDate: "2024-12-31",
  },
  "membership-expiring-urgent": {
    userName: t("admin.marketing.emailTemplates.sample.userShort"),
    tierName: "Premium",
    expirationDate: "2024-12-24",
  },
  // Marketing
  "marketing-newsletter": {
    userName: t("admin.marketing.emailTemplates.sample.userShort"),
    trendingProducts: [
      {
        title: "Hot Wheels Ferrari 458",
        price: 199,
        productUrl: "https://tarodan.com.tr/products/1",
      },
    ],
  },
  "marketing-monthly": {
    userName: t("admin.marketing.emailTemplates.sample.userShort"),
    featuredProducts: [
      {
        title: "Matchbox BMW M3",
        price: 149,
        productUrl: "https://tarodan.com.tr/products/2",
      },
    ],
  },
  // Seller application
  "seller-application-approved": {
    name: t("admin.marketing.emailTemplates.sample.personName"),
    companyName: t("admin.marketing.emailTemplates.sample.companyName"),
  },
  "seller-application-rejected": {
    name: t("admin.marketing.emailTemplates.sample.personName"),
    reason: t("admin.marketing.emailTemplates.sample.applicationRejection"),
  },
  "seller-document-revision": {
    name: t("admin.marketing.emailTemplates.sample.personName"),
    documentType: t("seller.documents.types.tax_plate"),
    reason: t("admin.marketing.emailTemplates.sample.applicationRejection"),
  },
  // Refund (seller did not ship)
  "seller-did-not-ship-refunded": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    refundAmount: 199.99,
  },
  // Trade
  "trade-received": {
    name: t("admin.marketing.emailTemplates.sample.userShort"),
    tradeId: "sample-trade",
    tradeUrl: "https://tarodan.com.tr/trades/sample-trade",
  },
  "trade-accepted": {
    name: t("admin.marketing.emailTemplates.sample.userShort"),
    tradeUrl: "https://tarodan.com.tr/trades/sample-trade",
  },
  "trade-shipped": {
    name: t("admin.marketing.emailTemplates.sample.userShort"),
    trackingNumber: "1234567890",
    tradeUrl: "https://tarodan.com.tr/trades/sample-trade",
  },
  "trade-completed": {
    name: t("admin.marketing.emailTemplates.sample.userShort"),
    tradeUrl: "https://tarodan.com.tr/trades/sample-trade",
  },
  // Guest
  "guest-checkout-otp": { code: "482913", expiresInMinutes: 10 },
  // Invoice
  "elogo-invoice": {
    recipientName: t("admin.marketing.emailTemplates.sample.valuedCustomer"),
    description: t("admin.marketing.emailTemplates.sample.commissionFee"),
    invoiceNumber: "TRD2026000000012",
    total: 450.77,
    type: "commission",
  },
  "seller-invoice": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    sellerName: "ABC Diecast Ltd.",
    orderNumber: "TRD-12345",
    productTitle: "Hot Wheels Ferrari 458",
  },
  // Order cancellation
  "order-cancelled-buyer": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    refundAmount: 199.99,
    reason: t("admin.marketing.emailTemplates.sample.sellerRemovedStock"),
  },
  "order-cancelled-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    reason: t("admin.marketing.emailTemplates.sample.buyerRequest"),
  },
  // Refund flow
  "refund-requested-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    refundAmount: 199.99,
    refundReason: t("admin.marketing.emailTemplates.sample.notAsDescribed"),
  },
  "refund-approved-buyer": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    refundAmount: 199.99,
  },
  "refund-rejected-buyer": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    reason: t("admin.marketing.emailTemplates.sample.usedReturn"),
  },
  "refund-return-label-buyer": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    returnTrackingNumber: "9876543210",
    cargoCompany: t("admin.marketing.emailTemplates.sample.cargoCompany"),
    returnUrl: "https://tarodan.com.tr/orders/sample-id/return",
  },
  "refund-completed": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    refundAmount: 199.99,
  },
  "refund-request-received-buyer": {
    buyerName: t("admin.marketing.emailTemplates.sample.buyer"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    refundAmount: 199.99,
  },
  "refund-return-incoming-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    returnTrackingNumber: "9876543210",
  },
  "refund-completed-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
    refundAmount: 199.99,
  },
  "refund-auto-accepted-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderNumber: "TRD-12345",
    orderId: "sample-id",
    productTitle: "Hot Wheels Ferrari 458",
  },
  // Review
  "review-received-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    reviewerName: t("admin.marketing.emailTemplates.sample.buyer"),
    rating: 5,
    productTitle: "Hot Wheels Ferrari 458",
    comment: t("admin.marketing.emailTemplates.sample.reviewComment"),
    reviewUrl: "https://tarodan.com.tr/seller/reviews",
  },
  // Listing & stock
  "listing-expiring": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    productTitle: "Hot Wheels Ferrari 458",
    daysRemaining: 3,
    expirationDate: "2024-12-31",
    listingUrl: "https://tarodan.com.tr/seller/listings",
  },
  "listing-expired": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    productTitle: "Hot Wheels Ferrari 458",
    listingUrl: "https://tarodan.com.tr/seller/listings",
  },
  "back-in-stock": {
    userName: t("admin.marketing.emailTemplates.sample.userShort"),
    productTitle: "Hot Wheels Ferrari 458",
    price: 199.99,
    productUrl: "https://tarodan.com.tr/products/sample",
  },
  // Social
  "new-follower": {
    name: t("admin.marketing.emailTemplates.sample.userShort"),
    followerName: t("admin.marketing.emailTemplates.sample.followerName"),
    followerUrl: "https://tarodan.com.tr/profile/followers",
  },
  // Payout
  "payout-released-seller": {
    sellerName: t("admin.marketing.emailTemplates.sample.seller"),
    orderNumber: "TRD-12345",
    payoutAmount: 179.99,
    bankAccountLast4: "4242",
    payoutDate: "2024-12-20",
  },
});
