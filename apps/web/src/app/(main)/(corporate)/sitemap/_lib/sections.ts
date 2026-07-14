/** @format */

export interface SitemapSection {
  titleKey: string;
  links: { href: string; labelKey: string }[];
}

/** Sitemap taxonomy — mirrors the header/footer navigation groups. */
export const SITEMAP_SECTIONS: SitemapSection[] = [
  {
    titleKey: "utility.sitemap.marketplace",
    links: [
      { href: "/", labelKey: "nav.home" },
      { href: "/listings", labelKey: "nav.listings" },
      { href: "/profile/trades", labelKey: "nav.trades" },
      { href: "/collections", labelKey: "nav.collections" },
      { href: "/manufacturers", labelKey: "nav.brands" },
      { href: "/models", labelKey: "nav.models" },
      { href: "/membership", labelKey: "membership.title" },
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
    titleKey: "footer.support",
    links: [
      { href: "/about", labelKey: "footer.about" },
      { href: "/contact", labelKey: "footer.contact" },
      { href: "/help", labelKey: "footer.help" },
      { href: "/faq", labelKey: "footer.faq" },
      { href: "/guides", labelKey: "footer.guides" },
      { href: "/shipping-delivery", labelKey: "footer.shipping" },
      { href: "/payment-options", labelKey: "footer.paymentOptions" },
      { href: "/returns-exchanges", labelKey: "footer.returns" },
      { href: "/security-features", labelKey: "footer.security" },
      { href: "/size-guide", labelKey: "footer.sizeGuide" },
      { href: "/authenticity", labelKey: "footer.authenticity" },
      { href: "/collectors-guide", labelKey: "footer.collectorsGuide" },
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
      { href: "/buyer-protection", labelKey: "footer.buyerProtection" },
      {
        href: "/intellectual-property",
        labelKey: "footer.intellectualProperty",
      },
    ],
  },
];
