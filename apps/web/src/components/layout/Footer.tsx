/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { locales, type Locale } from "@tarodan/i18n";
import { Select } from "@tarodan/ui";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import SocialLinks from "@/components/ui/SocialLinks";
import { Container } from "./Container";

const LOCALES: readonly Locale[] = locales;
const LOCALE_FLAGS: Record<Locale, string> = { tr: "🇹🇷", en: "🇬🇧" };

export default function Footer() {
  const t = useTranslations();

  // Dil adları endonimdir (her dil kendi adıyla listelenir), bu yüzden aktif
  // dilden bağımsız olarak katalogdan sabit anahtarlarla okunur.
  const LOCALE_NAMES: Record<Locale, string> = {
    tr: t("language.turkish"),
    en: t("language.english"),
  };
  const { currentLocale: locale, changeLanguage } = useLanguagePreference();

  // Footer columns mirror the route-group taxonomy (corporate / support / trust
  // / shopping / legal). New categories simply wrap onto the next row of the
  // grid below. Social accounts live in the bottom bar, not as a column.
  const FOOTER_COLUMNS: {
    title: string;
    links: { href: string; label: string }[];
  }[] = [
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
        { href: "/support", label: t("footer.helpSupport") },
        { href: "/faq", label: t("footer.faq") },
        { href: "/guides", label: t("nav.guides") },
        { href: "/collectors-guide", label: t("footer.collectorsGuide") },
        { href: "/size-guide", label: t("footer.sizeGuide") },
        { href: "/secure-swap", label: t("footer.secureSwap") },
      ],
    },
    {
      title: t("common.shopping"),
      links: [
        { href: "/shipping-delivery", label: t("footer.shipping") },
        { href: "/track-order", label: t("order.trackOrder") },
        { href: "/membership", label: t("membership.title") },
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
      ],
    },
  ];

  // `pb-safe`: sayfanın son satırı olduğu için altı, çentikli telefonlardaki
  // ana ekran çizgisinin altında kalabiliyordu.
  return (
    <footer className="bg-surface-elevated border-t border-border pb-safe">
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
                src="/app-store-badge.svg"
                alt={t("footer.downloadAppStore")}
                width={120}
                height={40}
                className="h-11 w-auto"
              />
              <Image
                src="/google-play-badge.svg"
                alt={t("footer.downloadGooglePlay")}
                width={239}
                height={71}
                className="h-11 w-auto"
              />
            </div>
          </div>
        </div>

        {/* Category columns — new categories wrap onto the next row */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
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
        </div>

        {/* Bottom bar — social accounts, locale/consent controls, copyright.
				    Stacks and centers below md, spreads onto one row above it. */}
        <div className="mt-8 flex flex-col items-center gap-4 border-t border-border py-6 md:grid md:grid-cols-3 md:items-center md:gap-6">
          <div className="order-1 flex flex-wrap items-center justify-center gap-3 md:order-none md:justify-start">
            <Select
              value={locale}
              onChange={(e) => {
                void changeLanguage(e.target.value as Locale);
              }}
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
            <Image
              src="/secure-payment-badge.svg"
              alt={t("checkout.securePayment")}
              width={135}
              height={24}
              className="h-4 w-auto"
            />
          </div>

          <p className="order-3 text-center text-xs text-subtle md:order-none">
            &copy; {new Date().getFullYear()} TARODAN. {t("footer.copyright")}
          </p>

          {/* Sarmalayıcı, `order` grid/flex ÖĞESİNE uygulanmalı diye var:
					    SocialLinks'in className'i kendi iç flex satırına gidiyor. */}
          <div className="order-2 md:order-none">
            <SocialLinks size="sm" className="md:-mr-2 md:justify-end" />
          </div>
        </div>
      </Container>
    </footer>
  );
}
