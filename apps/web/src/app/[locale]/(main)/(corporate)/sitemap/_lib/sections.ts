/** @format */

export interface SitemapSection {
  titleKey: string;
  links: { href: string; labelKey: string }[];
}

/**
 * Sitemap taksonomisi — footer sütunlarını birebir yansıtır (kurumsal / yardım
 * & destek / alışveriş / yasal), önüne de header ve hesap akışlarından gelen
 * pazar yeri, satış ve hesap grupları eklenir. Footer'dan bir link kalktığında
 * buradan da kalkar; yoksa site haritası kullanıcının hiçbir yerden
 * ulaşamayacağı sayfaları listelemeye devam eder.
 */
export const SITEMAP_SECTIONS: SitemapSection[] = [
  {
    titleKey: "utility.sitemap.marketplace",
    links: [
      { href: "/", labelKey: "nav.home" },
      { href: "/listings", labelKey: "nav.listings" },
      { href: "/profile/trades", labelKey: "nav.trades" },
      { href: "/collections", labelKey: "nav.collections" },
      { href: "/manufacturers", labelKey: "nav.brands" },
    ],
  },
  {
    titleKey: "utility.sitemap.sell",
    links: [
      { href: "/sell", labelKey: "utility.sitemap.sellOnSite" },
      { href: "/seller/register", labelKey: "utility.sitemap.sellerRegister" },
      {
        href: "/register/business",
        labelKey: "utility.sitemap.businessRegister",
      },
    ],
  },
  {
    titleKey: "utility.sitemap.account",
    links: [
      { href: "/login", labelKey: "auth.loginTitle" },
      { href: "/register", labelKey: "auth.registerTitle" },
      { href: "/profile", labelKey: "nav.profile" },
      { href: "/profile/orders", labelKey: "nav.myOrders" },
      { href: "/profile/favorites", labelKey: "nav.favorites" },
      { href: "/profile/messages", labelKey: "nav.messages" },
      { href: "/cart", labelKey: "nav.cart" },
    ],
  },
  {
    titleKey: "footer.corporate",
    links: [
      { href: "/about", labelKey: "footer.about" },
      { href: "/contact", labelKey: "footer.contact" },
      { href: "/newsletter", labelKey: "footer.newsletter" },
    ],
  },
  {
    titleKey: "footer.helpSupport",
    links: [
      { href: "/support", labelKey: "footer.helpSupport" },
      { href: "/faq", labelKey: "footer.faq" },
      { href: "/guides", labelKey: "footer.guides" },
      { href: "/collectors-guide", labelKey: "footer.collectorsGuide" },
      { href: "/size-guide", labelKey: "footer.sizeGuide" },
      { href: "/secure-swap", labelKey: "footer.secureSwap" },
    ],
  },
  {
    titleKey: "common.shopping",
    links: [
      { href: "/shipping-delivery", labelKey: "footer.shipping" },
      { href: "/track-order", labelKey: "order.trackOrder" },
      { href: "/membership", labelKey: "membership.title" },
    ],
  },
  {
    titleKey: "footer.legal",
    links: [
      { href: "/terms", labelKey: "footer.terms" },
      { href: "/privacy", labelKey: "footer.privacy" },
      { href: "/cookies", labelKey: "footer.cookies" },
      { href: "/distance-sales", labelKey: "footer.distanceSales" },
      { href: "/refund-policy", labelKey: "footer.refundPolicy" },
      { href: "/seller-agreement", labelKey: "footer.sellerAgreement" },
    ],
  },
];
