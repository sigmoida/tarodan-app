/** @format */

"use client";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { locales, type Locale } from "@tarodan/i18n";
import { Button, Select } from "@tarodan/ui";
import { Container } from "./Container";

const LOCALES: readonly Locale[] = locales;
const LOCALE_NAMES: Record<Locale, string> = { tr: "Türkçe", en: "English" };
const LOCALE_FLAGS: Record<Locale, string> = { tr: "🇹🇷", en: "🇬🇧" };

const SOCIAL_LINKS = [
  { label: "X", href: "https://x.com" },
  { label: "Instagram", href: "https://www.instagram.com/tarodan.com.tr/" },
  { label: "Facebook", href: "https://facebook.com" },
  { label: "TikTok", href: "https://www.tiktok.com" },
];

export default function Footer() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL-based locale (#214): navigate to the SAME page under the chosen locale's
  // prefix (`/products` ⇄ `/en/products`), preserving the query string.
  // `usePathname`/`router` come from `@/i18n/navigation`, so the pathname is
  // locale-stripped and `replace` re-adds the target prefix (and syncs the
  // NEXT_LOCALE cookie) — a real navigation, not just a cookie write + refresh.
  const changeLocale = (next: Locale) => {
    const query = Object.fromEntries(searchParams.entries());
    router.replace({ pathname, query }, { locale: next });
  };

  const clearCookieConsent = () => {
    localStorage.removeItem("cookie_consent");
    window.location.reload();
  };

  // Footer columns mirror the route-group taxonomy 1:1 (marketplace shortcuts +
  // corporate / support / trust / shopping / legal). New categories simply wrap
  // onto the next row of the grid below.
  const FOOTER_COLUMNS: {
    title: string;
    links: { href: string; label: string }[];
  }[] = [
    {
      title: t("footer.marketplace"),
      links: [
        { href: "/listings", label: t("nav.listings") },
        { href: "/profile/trades", label: t("nav.trades") },
        { href: "/collections", label: t("nav.collections") },
        { href: "/membership", label: t("membership.title") },
      ],
    },
    {
      title: t("footer.corporate"),
      links: [
        { href: "/about", label: t("footer.about") },
        { href: "/contact", label: t("footer.contact") },
        { href: "/newsletter", label: t("footer.newsletter") },
        { href: "/sitemap", label: t("footer.sitemap") },
      ],
    },
    {
      title: t("footer.helpSupport"),
      links: [
        { href: "/help", label: t("footer.help") },
        { href: "/support", label: t("footer.supportCenter") },
        { href: "/faq", label: t("footer.faq") },
        { href: "/guides", label: t("nav.guides") },
        { href: "/collectors-guide", label: t("footer.collectorsGuide") },
        { href: "/size-guide", label: t("footer.sizeGuide") },
      ],
    },
    {
      title: t("footer.trustSafety"),
      links: [
        { href: "/secure-swap", label: t("footer.secureSwap") },
        { href: "/buyer-protection", label: t("footer.buyerProtection") },
        { href: "/authenticity", label: t("footer.authenticity") },
        { href: "/security-features", label: t("footer.securityFeatures") },
      ],
    },
    {
      title: t("common.shopping"),
      links: [
        { href: "/payment-options", label: t("footer.paymentOptions") },
        { href: "/shipping-delivery", label: t("footer.shipping") },
        { href: "/returns-exchanges", label: t("footer.returns") },
        { href: "/sell", label: t("footer.sell") },
        {
          href: "/platform-service-fee",
          label: t("footer.platformServiceFee"),
        },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/terms", label: t("footer.terms") },
        { href: "/privacy", label: t("footer.privacy") },
        { href: "/cookies", label: t("footer.cookies") },
        { href: "/distance-sales", label: t("footer.distanceSales") },
        { href: "/refund-policy", label: t("footer.refundPolicy") },
        { href: "/seller-agreement", label: t("footer.sellerAgreement") },
        {
          href: "/intellectual-property",
          label: t("footer.intellectualProperty"),
        },
      ],
    },
  ];

  return (
    <footer className="bg-surface-elevated border-t border-border">
      <Container className="pt-16">
        {/* Brand + app download */}
        <div className="mb-12 flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/" className="mb-3 inline-block">
              <Image
                src="/tarodan-logo.jpg"
                alt="Tarodan"
                width={162}
                height={40}
                className="rounded-lg object-contain"
              />
            </Link>
            <p className="max-w-[320px] text-xs leading-relaxed text-muted">
              {t("footer.description")}
            </p>
          </div>

          {/* App stores — grab the app on iOS / Android */}
          <div className="sm:text-right">
            <p className="mb-3 text-sm font-medium text-heading">
              {t("footer.appPromo")}
            </p>
            {/* Both official badges fill their whole viewBox (no built-in
						    padding), so the SAME rendered height makes the buttons match;
						    only the widths differ (different aspect ratios). Pass each true
						    intrinsic size so no layout shift, and items-center aligns them. */}
            <div className="flex items-center gap-2 sm:justify-end">
              <Image
                src="/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg"
                alt={t("footer.downloadAppStore")}
                width={120}
                height={40}
                className="h-11 w-auto"
              />
              <Image
                src="/GetItOnGooglePlay_Badge_Web_color_English.svg"
                alt={t("footer.downloadGooglePlay")}
                width={239}
                height={71}
                className="h-11 w-auto"
              />
            </div>
          </div>
        </div>

        {/* Category columns — new categories wrap onto the next row */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-heading">
                {col.title}
              </h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-primary-500"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Follow us */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-heading">
              {t("footer.followUs")}
            </h3>
            <ul className="space-y-2">
              {SOCIAL_LINKS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted transition-colors hover:text-primary-500"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border mt-8 py-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs text-subtle">
            &copy; {new Date().getFullYear()} TARODAN. {t("footer.copyright")}
          </p>
          <div className="flex items-center gap-3">
            <Select
              value={locale}
              onChange={(e) => changeLocale(e.target.value as Locale)}
              selectSize="sm"
              aria-label={t("language.language")}
              className="w-auto"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_FLAGS[l]} {LOCALE_NAMES[l]}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCookieConsent}
              className="text-xs text-muted"
            >
              {t("footer.cookieSettings")}
            </Button>
            <Image
              src="/idHcfrz3L6_1783526429272.svg"
              alt={t("checkout.securePayment")}
              width={135}
              height={24}
              className="h-5 w-auto"
            />
          </div>
        </div>
      </Container>
    </footer>
  );
}
