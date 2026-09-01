/** @format */

"use client";

import type { ComponentType, SVGProps } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import {
  UserCircleIcon,
  ShoppingBagIcon,
  TagIcon,
  ArrowsRightLeftIcon,
  CurrencyDollarIcon,
  TicketIcon,
  BanknotesIcon,
  CreditCardIcon,
  ReceiptRefundIcon,
  RectangleStackIcon,
  HeartIcon,
  UserGroupIcon,
  BookmarkIcon,
  ChartBarIcon,
  ChartPieIcon,
  ChatBubbleLeftRightIcon,
  BellIcon,
  LifebuoyIcon,
  BuildingStorefrontIcon,
  ShieldCheckIcon,
  NoSymbolIcon,
  ArrowRightOnRectangleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button } from "@tarodan/ui";
import UserAvatar from "@/components/UserAvatar";
import { membershipNavLabel } from "@/lib/membership";
import { useLocale, useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/authStore";
import { useProfile } from "../_context/ProfileContext";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavLink {
  icon: Icon;
  label: string;
  href: string;
  /** Live badge count; 0/undefined hides it. */
  badge?: number;
}

interface NavSection {
  /** Category header; omit for standalone (uncategorized) rows. */
  title?: string;
  links: NavLink[];
}

/**
 * The persistent left nav for `/profile/*`. Categorized to mirror the route-group
 * taxonomy under `profile/` (commerce · finance · collection · insights · messaging
 * · account); `Profil` and `Güvenlik` are standalone (uncategorized) rows. Live
 * active-state highlighting + the badges the profile overview already loads.
 */
export default function ProfileSidebar({
  /** Çekmecede kart çerçevesi istenmez — panelin kendi kenarı zaten var. */
  className,
  /** Bir bağlantıya gidildiğinde çağrılır (çekmeceyi kapatmak için). */
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
} = {}) {
  const t = useTranslations();
  const pathname = usePathname();
  const {
    profile,
    pendingCounts,
    wishlistCount,
    unreadMessagesCount,
    handleLogout,
  } = useProfile();
  // Kurumsal akıştaki hesap: businessStatus atanmış (pending/approved/rejected).
  const isCorporateAccount = useAuthStore(
    (s) => s.user?.businessStatus != null,
  );

  const sections: NavSection[] = [
    {
      links: [
        {
          icon: UserCircleIcon,
          label: t("profile.myProfile"),
          href: "/profile",
        },
        {
          // Ödeme Yöntemleri de kart ikonu kullanıyordu; ayırt edilebilsin diye
          // üyeliğe kendi ikonu verildi.
          icon: SparklesIcon,
          label: membershipNavLabel(t, profile?.membershipTier),
          href: "/profile/membership",
        },
      ],
    },
    {
      title: t("profile.sidebar.alisveris"),
      links: [
        {
          icon: ShoppingBagIcon,
          label: t("nav.myListings"),
          href: "/profile/listings",
        },
        { icon: TagIcon, label: t("order.myOrders"), href: "/profile/orders" },
        {
          icon: ArrowsRightLeftIcon,
          label: t("trade.myTrades"),
          href: "/profile/trades",
          badge: pendingCounts.trades,
        },
        {
          icon: CurrencyDollarIcon,
          label: t("offer.myOffers"),
          href: "/profile/offers",
          badge: pendingCounts.offers,
        },
        {
          icon: TicketIcon,
          label: t("profile.sidebar.indirimlerim"),
          href: "/profile/discounts",
        },
      ],
    },
    {
      title: t("profile.sidebar.finans"),
      links: [
        {
          icon: BanknotesIcon,
          label: t("profile.sidebar.odemelerim"),
          href: "/profile/payments",
        },
        {
          icon: CreditCardIcon,
          label: t("profile.sidebar.odemeYontemleri"),
          href: "/profile/payment-methods",
        },
        {
          icon: ReceiptRefundIcon,
          label: t("profile.sidebar.iadeTalepleri"),
          href: "/profile/refund-requests",
        },
      ],
    },
    {
      title: t("profile.sidebar.koleksiyon"),
      links: [
        {
          icon: RectangleStackIcon,
          label: t("collection.myCollections"),
          href: "/profile/collections",
        },
        {
          icon: HeartIcon,
          label: t("nav.favorites"),
          href: "/profile/favorites",
          badge: wishlistCount,
        },
        {
          icon: UserGroupIcon,
          label: t("profile.sidebar.takipEttiklerim"),
          href: "/profile/following",
        },
        {
          icon: BookmarkIcon,
          label: t("profile.sidebar.kayitliAramalar"),
          href: "/profile/saved-searches",
        },
      ],
    },
    {
      title: t("profile.sidebar.analiz"),
      links: [
        {
          icon: ChartBarIcon,
          label: t("profile.sidebar.istatistikler"),
          href: "/profile/statistics",
        },
        {
          icon: ChartPieIcon,
          label: t("profile.sidebar.analitik"),
          href: "/profile/analytics",
        },
      ],
    },
    {
      title: t("profile.sidebar.iletisim"),
      links: [
        {
          icon: ChatBubbleLeftRightIcon,
          label: t("nav.messages"),
          href: "/profile/messages",
          badge: unreadMessagesCount,
        },
        {
          icon: BellIcon,
          label: t("nav.notifications"),
          href: "/profile/notifications",
        },
        // Destek `/profile` ALTINDA DEĞİL: talep ekranı profil dışında,
        // kendi route grubunda yaşıyor. Bağlantı yine de buraya ait — kullanıcı
        // için destek de bir iletişim kanalı.
        {
          icon: LifebuoyIcon,
          label: t("nav.support"),
          href: "/support",
        },
      ],
    },
    // İşletme sayfası yalnız kurumsal akıştaki hesaplara ait (başvuru
    // tamamlama + panel). Bireysel kullanıcı bağlantıyı hiç görmez; adresi
    // elle yazarsa sayfa profile geri yönlendirir.
    ...(isCorporateAccount
      ? [
          {
            title: t("profile.sidebar.hesap"),
            links: [
              {
                icon: BuildingStorefrontIcon,
                label: t("profile.sidebar.isletme"),
                href: "/profile/business",
              },
            ],
          },
        ]
      : []),
    {
      links: [
        {
          icon: ShieldCheckIcon,
          label: t("profile.sidebar.guvenlik"),
          href: "/profile/security",
        },
        {
          icon: NoSymbolIcon,
          label: t("profile.sidebar.engellenenler"),
          href: "/profile/blocked",
        },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/profile"
      ? pathname === "/profile"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      className={`flex flex-col overflow-hidden bg-surface-elevated ${
        className ?? "rounded-lg border border-border-subtle"
      }`}
    >
      {/* Identity header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <UserAvatar
          displayName={profile?.displayName || profile?.email}
          avatarUrl={profile?.avatarUrl}
          size="sm"
          className="!w-11 !h-11 flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-heading truncate">
            {profile?.displayName || t("nav.account")}
          </p>
          <p className="text-xs text-muted truncate">{profile?.email}</p>
          {profile?.adminCode && (
            <p className="mt-0.5 text-2xs font-medium text-subtle">
              {profile.adminCode}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border-subtle" />

      <div className="py-2">
        {sections.map((section, si) => (
          <div
            key={section.title ?? `section-${si}`}
            className="mb-1 last:mb-0"
          >
            {section.title && (
              <p className="px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-widest text-subtle">
                {section.title}
              </p>
            )}
            <ul>
              {section.links.map(({ icon: LinkIcon, label, href, badge }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        active
                          ? "bg-primary-50 text-primary-600 font-medium"
                          : "text-body hover:bg-surface-alt hover:text-heading"
                      }`}
                    >
                      <LinkIcon className="w-5 h-5 flex-shrink-0" />
                      <span className="flex-1 truncate">{label}</span>
                      {badge != null && badge > 0 && (
                        <Badge
                          variant="danger"
                          appearance="solid"
                          size="sm"
                          className="ml-auto min-w-[18px] justify-center rounded-full px-1.5"
                        >
                          {badge > 99 ? "99+" : badge}
                        </Badge>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border-subtle" />

      <Button
        variant="ghost"
        onClick={handleLogout}
        className="flex w-full items-center justify-start gap-3 rounded-none px-4 py-2.5 text-sm font-normal text-danger-600 hover:bg-danger-50 hover:text-danger-600"
      >
        <ArrowRightOnRectangleIcon className="w-5 h-5 flex-shrink-0" />
        {t("common.logout")}
      </Button>
    </nav>
  );
}
