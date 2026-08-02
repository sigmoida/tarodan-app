/** @format */

"use client";

import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  PlusIcon,
  ChatBubbleLeftRightIcon,
  ShoppingCartIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import NotificationBell from "@/components/notifications/NotificationBell";
import { withChunkErrorLogging } from "@/lib/withChunkErrorLogging";
import { useLocale, useTranslations } from "next-intl";
import { Container } from "./Container";
import HeaderSearch from "./header/HeaderSearch";
import AccountMenu from "./header/AccountMenu";
import CategoryNav from "./header/CategoryNav";
import CatalogNavDrawer from "./header/CatalogNavDrawer";
import HeaderMenuButton from "./header/HeaderMenuButton";
import TopAdsBar from "./header/TopAdsBar";
import { useHeaderData } from "./header/_hooks/useHeaderData";
import { shouldShowCategoryBar } from "./header/_lib/categoryBar";
import { mobileNavVariant } from "./header/_lib/mobileNav";

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(
    () => import("@/components/AuthRequiredModal"),
    "AuthRequiredModal",
  ),
  { ssr: false },
);

/**
 * The whole storefront header as one unit: the top-ads marquee (scrolls away),
 * then the sticky header block holding the main bar (logo + search + action
 * cluster + account menu) and, directly beneath it, the category bar — both
 * wrapped in the shared `Container`. No framer-motion, no scroll-hide: the
 * header block stays pinned with `sticky top-0`.
 */
export default function Header() {
  const t = useTranslations();
  const pathname = usePathname();
  const headerData = useHeaderData();
  const {
    showAuthUI,
    user,
    unreadMessageCount,
    unreadNotificationsCount,
    pendingOffersCount,
    pendingTradesCount,
    cartCount,
    wishlistCount,
  } = headerData;

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTradesAuthModal, setShowTradesAuthModal] = useState(false);

  const showCategoryBar = shouldShowCategoryBar(pathname);
  // Hamburger yalnız bir çekmecenin bağlı olduğu yollarda görünür. Katalog
  // çekmecesini Header bağlar; profil çekmecesi `ProfileShell` içinde durur
  // (hesap navigasyonu `ProfileProvider`'a bağlı ve o sağlayıcı burada yok).
  const navVariant = mobileNavVariant(pathname);

  return (
    <>
      {/* Slim Top Bar - Image Marquee (50px / 40px mobile) */}
      <TopAdsBar />

      {/*
        Sticky header block: main bar + category bar together, always visible.
        `data-sticky-header` is the measurement hook the onboarding tour uses to
        compute its scroll offset — without it the spotlight scrolled a target to
        y=0 and this block covered it (the category bar makes the height variable,
        so a constant would drift).
      */}
      <div className="sticky top-0 z-50" data-sticky-header>
        {/* Main bar */}
        <div className="bg-primary-500 border-b border-primary-600 shadow-sm">
          <Container>
            {/*
              `lg` altında satır sarar: logo + eylemler birinci satırda kalır,
              arama `order-last basis-full` ile ikinci satıra iner. Aramayı iki
              kez render etmek yerine sarma kullanılıyor — ikinci bir örnek kendi
              durumunu, debounce'unu ve dışarı-tıklama dinleyicisini kurardı.
            */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2 sm:gap-x-4 lg:h-16 lg:flex-nowrap lg:py-0">
              {navVariant && <HeaderMenuButton />}

              {/* Logo */}
              <Link
                href="/"
                className="flex-shrink-0 flex items-center hover:opacity-90 transition-opacity h-8"
              >
                <Image
                  src="/tarodan-logo-transparent.png"
                  alt="Tarodan Logo"
                  width={120}
                  height={38}
                  className="object-contain max-h-8 w-auto max-w-[104px] sm:max-w-none"
                  priority
                />
              </Link>

              {/* Arama - ortada */}
              <HeaderSearch />

              {/* Right - İlan Ver + Menü + Hesap dropdown */}
              <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                {showAuthUI && (
                  <>
                    {/*
                      İlan Ver — yazısı duruyor, ama YÜKSEKLİĞİ sağındaki
                      mesaj/bildirim/sepet düğmeleriyle aynı (36px). Varsayılan
                      `md` boyu h-10 verdiği için sıra iki farklı yükseklikte
                      görünüyordu. Dar ekranda etiket gizlenip yalnız ikon kalır,
                      o yüzden `aria-label` her durumda adı taşır.
                    */}
                    <Button
                      variant="nav"
                      asChild
                      aria-label={t("nav.newListing")}
                      title={t("nav.newListing")}
                      className="h-9 gap-1.5 rounded-md px-2 sm:px-3"
                    >
                      <Link href="/listings/new" data-tour="new-listing">
                        <PlusIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">
                          {t("nav.newListing")}
                        </span>
                      </Link>
                    </Button>

                    {/*
                      İkincil ikonlar (mesajlar + bildirimler) `lg` altında
                      gizlenir: dar ekranda sağ küme logoyu ve hamburger'ı
                      eziyordu. İkisi de hesap menüsünden erişilebilir kalır, o
                      yüzden gizlemek bir yolu kapatmıyor.
                    */}
                    <div className="hidden items-center gap-1 lg:flex">
                      {/* Mesajlar - bildirim zilinin solunda hızlı erişim */}
                      <Button
                        variant="nav"
                        size="icon"
                        asChild
                        aria-label={t("nav.messages")}
                        title={t("nav.messages")}
                        className="relative h-9 w-9 rounded-md"
                      >
                        <Link href="/profile/messages">
                          <ChatBubbleLeftRightIcon className="w-6 h-6" />
                          {unreadMessageCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-danger-500 text-inverted text-2xs font-semibold rounded-full">
                              {unreadMessageCount > 99
                                ? "99+"
                                : unreadMessageCount}
                            </span>
                          )}
                        </Link>
                      </Button>

                      {/* Notification Bell */}
                      <NotificationBell />
                    </div>
                  </>
                )}

                {/* Sepet - en sağda, Giriş Yap'ın sağında ikon + yazı */}
                <Button
                  variant="nav"
                  size="icon"
                  asChild
                  aria-label={t("nav.cart")}
                  title={t("nav.cart")}
                  className="relative h-9 w-9 rounded-md"
                >
                  <Link href="/cart" data-tour="cart">
                    <ShoppingCartIcon className="w-5 h-5" />
                    {cartCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-surface-elevated text-primary-500 text-xs rounded-full flex items-center justify-center font-semibold">
                        {cartCount > 9 ? "9+" : cartCount}
                      </span>
                    )}
                  </Link>
                </Button>

                <AccountMenu
                  showAuthUI={showAuthUI}
                  user={user}
                  unreadMessageCount={unreadMessageCount}
                  unreadNotificationsCount={unreadNotificationsCount}
                  pendingOffersCount={pendingOffersCount}
                  pendingTradesCount={pendingTradesCount}
                  wishlistCount={wishlistCount}
                  setShowTradesAuthModal={setShowTradesAuthModal}
                />
              </div>
            </div>
          </Container>
        </div>

        {/*
          Category bar - directly under the main bar, same header unit.
          `lg` altında hiç render edilmez: aynı öğeler hamburger çekmecesinde
          dikey listeye iniyor. Eski yatay kaydırmalı hâli dar ekranda hem
          keşfedilmez hem de mega-panelleri açılamaz haldeydi.
        */}
        {showCategoryBar && (
          <div className="relative z-40 hidden border-b border-primary-200 bg-surface lg:block">
            <Container className="px-4">
              <CategoryNav />
            </Container>
          </div>
        )}
      </div>

      {/* Küçük ekran katalog gezinmesi — sticky bloğun dışında, portal zaten
          gövdeye taşıyor ama yığılma bağlamına girmesin. */}
      {navVariant === "catalog" && <CatalogNavDrawer />}

      {/* Auth modals must be outside the sticky block to escape its stacking context */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={t("nav.loginToCreateListing")}
        message={t("nav.loginToCreateListingMsg")}
        icon={<PlusIcon className="w-10 h-10 text-primary-500" />}
        redirectPath="/listings/new"
      />

      <AuthRequiredModal
        isOpen={showTradesAuthModal}
        onClose={() => setShowTradesAuthModal(false)}
        title={t("nav.loginForTrades")}
        message={t("trade.tradeRequiresLogin")}
        icon={<ArrowsRightLeftIcon className="w-10 h-10 text-primary-500" />}
        redirectPath="/profile/trades"
      />
    </>
  );
}
