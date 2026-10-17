"use client";

import { Link, usePathname } from "@/i18n/navigation";
import HeroPicture from "@/components/marketing/HeroPicture";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { pickLocalized, type HeroSlideDto } from "@tarodan/types";

/**
 * Shared two-panel hero frame for every auth screen. One column = brand logo +
 * the centered form (`AuthCard`, rendered as `children`) + copyright. The other
 * column = a marketplace hero image with a punchy, top-left headline, shown on
 * `lg+`. The hero comes from the admin-managed CMS (fetched by the server
 * layout): registration routes use the `auth_register` placement, every other
 * auth route `auth_default`. No hero configured → the form renders on its own.
 */

export interface AuthHeroes {
  register: HeroSlideDto | null;
  default: HeroSlideDto | null;
}

const REGISTER_PREFIX = "/register";

export default function AuthHeroFrame({
  heroes,
  children,
}: {
  heroes: AuthHeroes;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const hero = (pathname ?? "").startsWith(REGISTER_PREFIX)
    ? heroes.register
    : heroes.default;
  const heroLeft = hero?.imageSide === "left";

  return (
    <div className="flex min-h-dvh">
      {/* Form column */}
      <div
        className={`flex flex-1 flex-col bg-surface-elevated ${
          heroLeft ? "lg:order-2" : "lg:order-1"
        }`}
      >
        {/*
          Logo, form ve alt bilgi AYNI sütunda: genişlik `AuthCard`'ın
          `max-w-md`'siyle birebir, hepsi sola dayalı. Eskiden logo sütunun en
          solunda (p-6), form ortada, telif metni ortalanmış duruyordu — üç
          eleman üç farklı hizada başlıyordu.
        */}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6">
          <header className="py-6">
            <Link href="/" className="inline-flex items-center gap-2">
              <Image
                src="/tarodan-logo.jpg"
                alt="Tarodan"
                width={162}
                height={40}
                className="rounded-lg object-contain"
              />
            </Link>
          </header>

          <main className="flex flex-1 items-center py-8">{children}</main>

          <footer className="py-6">
            <p className="text-sm text-subtle">
              © {new Date().getFullYear()} Tarodan. {t("footer.copyright")}
            </p>
          </footer>
        </div>
      </div>

      {hero && <HeroPanel hero={hero} locale={locale} heroLeft={heroLeft} />}
    </div>
  );
}

/**
 * Auth-flow hero panel (lg+), side driven by the slide's `imageSide`.
 *
 * `lg:h-dvh` + yapışkan konum: panel esnek satırın yüksekliğini takip
 * ETMEZ. Aksi halde uzun formlar (kurumsal başvuru) satırı büyütüyor ve
 * görsel bireysel sekmede bir boyda, kurumsal sekmede bambaşka bir boyda
 * görünüyordu. `self-start` şart — esnek öğe varsayılan olarak gerilir ve
 * gerilmiş bir öğede `sticky` çalışmaz.
 */
function HeroPanel({
  hero,
  locale,
  heroLeft,
}: {
  hero: HeroSlideDto;
  locale: string;
  heroLeft: boolean;
}) {
  const title = pickLocalized(hero.title, locale);
  const subtitle = pickLocalized(hero.subtitle, locale);

  return (
    <div
      className={`relative hidden flex-1 overflow-hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start ${
        heroLeft ? "lg:order-1" : "lg:order-2"
      }`}
    >
      {/*
        Panel `lg` altında `hidden` — ama CSS ile gizlenen bir görsel yine de
        indirilir. `sizes`'ın ikinci dalı bu yüzden `1px`: telefonda tarayıcı
        srcset'in en küçük varyantını seçer, masaüstünde panelin gerçek payı
        olan yarım ekranı.
      */}
      <HeroPicture
        imageUrl={hero.imageUrl}
        alt={pickLocalized(hero.imageAlt, locale) || title}
        sizes="(min-width: 1024px) 50vw, 1px"
        className="object-cover"
        priority
      />
      {/* Darkest at the top-left corner so the headline stays legible there. */}
      <div className="absolute inset-0 bg-gradient-to-br from-heading/80 via-heading/45 to-heading/10" />

      {/*
        Burada bir zamanlar "10K+ ilan · 5K+ üye · 2K+ takas" sabit sayıları
        vardı. Pazaryeri boşken bu rakamlar en yüksek niyetli sayfada (kayıt)
        doğrudan yanlış beyandı. Sayı yerine mesaj konuşuyor.
      */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end p-10 lg:p-14">
        <div className="max-w-lg">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-inverted drop-shadow-lg lg:text-5xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-4 max-w-md text-base text-inverted/85 drop-shadow lg:text-lg">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
