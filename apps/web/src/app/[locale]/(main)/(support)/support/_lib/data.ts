import type { ComponentType, SVGProps } from "react";
import {
  TruckIcon,
  CreditCardIcon,
  UserCircleIcon,
  TagIcon,
  ArrowsRightLeftIcon,
  WrenchScrewdriverIcon,
  EllipsisHorizontalCircleIcon,
  QuestionMarkCircleIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import type { Translate } from "@/types/i18n";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface TicketCategory {
  id: string;
  label: string;
  icon: Icon;
}

export const ticketCategories = (t: Translate): TicketCategory[] => [
  { id: "shipping", label: t("support.content.siparisKargo"), icon: TruckIcon },
  { id: "payment", label: t("support.content.odeme"), icon: CreditCardIcon },
  { id: "account", label: t("support.content.hesap"), icon: UserCircleIcon },
  { id: "product", label: t("support.content.ilanUrun"), icon: TagIcon },
  { id: "trade", label: t("support.content.takas"), icon: ArrowsRightLeftIcon },
  {
    id: "technical",
    label: t("support.content.teknikSorun"),
    icon: WrenchScrewdriverIcon,
  },
  {
    id: "other",
    label: t("support.content.diger"),
    icon: EllipsisHorizontalCircleIcon,
  },
];

export const ticketStatusStyles = (
  t: Translate,
): Record<string, { label: string; className: string }> => ({
  open: {
    label: t("support.content.acik"),
    className: "bg-info-100 text-info-800",
  },
  in_progress: {
    label: t("support.content.inceleniyor"),
    className: "bg-warning-100 text-warning-800",
  },
  waiting_customer: {
    label: t("support.content.yanitinizBekleniyor"),
    className: "bg-primary-100 text-primary-800",
  },
  resolved: {
    label: t("support.content.cozuldu"),
    className: "bg-success-100 text-success-800",
  },
  closed: {
    label: t("support.content.kapatildi"),
    className: "bg-surface-alt text-muted",
  },
});

/** Human category label for a stored category id. */
export function categoryLabel(id: string, t: Translate): string {
  return ticketCategories(t).find((c) => c.id === id)?.label ?? id;
}

export interface Ticket {
  id: string;
  ticketNumber?: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TicketMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketDetail {
  id: string;
  ticketNumber?: string;
  creatorId: string;
  subject: string;
  category: string;
  status: string;
  messages: TicketMessage[];
  createdAt: string;
}

/**
 * Kendine yardım içeriği — eskiden ayrı bir /help sayfasındaydı. Yardım Merkezi
 * ile Destek Merkezi tek sayfada birleştiği için (kullanıcı önce çözümü arar,
 * bulamazsa talep açar) konu listeleri de talep sistemiyle aynı yerde durur.
 */
export interface HelpTopic {
  title: string;
  icon: Icon;
  links: { href: string; label: string }[];
}

export const helpTopics = (t: Translate): HelpTopic[] => [
  {
    title: t("support.content.baslangic"),
    icon: QuestionMarkCircleIcon,
    links: [
      { href: "/guides", label: t("support.content.kullanimKilavuzu") },
      { href: "/faq", label: t("support.content.sikcaSorulanSorular") },
      { href: "/register", label: t("support.content.uyeOlun") },
    ],
  },
  {
    title: t("support.content.satinAlma"),
    icon: ShoppingCartIcon,
    links: [
      {
        href: "/faq#alisveris-takas",
        label: t("support.content.nasilAlisverisYapilir"),
      },
      { href: "/payment-options", label: t("support.content.odemeYontemleri") },
      {
        href: "/refund-policy",
        label: t("support.content.iadeVeIptalKosullari"),
      },
    ],
  },
  {
    title: t("support.content.satisYapma"),
    icon: CurrencyDollarIcon,
    links: [
      { href: "/guides#selling", label: t("support.content.ilanVermeRehberi") },
      {
        href: "/faq#alisveris-takas",
        label: t("support.content.komisyonVeHizmetBedelleri"),
      },
      { href: "/membership", label: t("support.content.uyelikPlanlari") },
    ],
  },
  {
    title: t("support.content.takas"),
    icon: ArrowsRightLeftIcon,
    links: [
      { href: "/secure-swap", label: t("support.content.guvenliTakas") },
      {
        href: "/faq#alisveris-takas",
        label: t("support.content.takasNasilCalisir"),
      },
      { href: "/profile/trades", label: t("support.content.takaslarim") },
    ],
  },
  {
    title: t("support.content.kargoVeTeslimat"),
    icon: TruckIcon,
    links: [
      {
        href: "/shipping-delivery",
        label: t("support.content.kargoVeTeslimat"),
      },
      { href: "/faq#alisveris-takas", label: t("support.content.kargoTakibi") },
      { href: "/refund-policy", label: t("support.content.hasarliUrunIade") },
    ],
  },
  {
    title: t("support.content.hesapVeGuvenlik"),
    icon: ShieldCheckIcon,
    links: [
      { href: "/profile", label: t("support.content.profilVeAdresler") },
      { href: "/support", label: t("support.content.destekTalebiOlustur") },
      { href: "/privacy", label: t("support.content.gizlilikPolitikasi") },
    ],
  },
];

export const popularTopics = (t: Translate): { q: string; href: string }[] => [
  { q: t("support.content.ilkSatisimiNasilYaparim"), href: "/guides#selling" },
  {
    q: t("support.content.urunlerimiNasilOnPlanaCikartirim"),
    href: "/faq#populer-konular",
  },
  {
    q: t("support.content.takasTeklifiNasilGonderirim"),
    href: "/faq#populer-konular",
  },
  {
    q: t("support.content.uyelikPlanlariArasindakiFarklarNelerdir"),
    href: "/membership",
  },
  {
    q: t("support.content.siparisimiNasilTakipEderim"),
    href: "/faq#populer-konular",
  },
  {
    q: t("support.content.iadeVeIptalKosullariNelerdir"),
    href: "/refund-policy",
  },
];
