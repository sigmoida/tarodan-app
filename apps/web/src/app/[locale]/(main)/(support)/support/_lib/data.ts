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

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface TicketCategory {
  id: string;
  label: string;
  icon: Icon;
}

export const CATEGORIES: TicketCategory[] = [
  { id: "shipping", label: "Sipariş / Kargo", icon: TruckIcon },
  { id: "payment", label: "Ödeme", icon: CreditCardIcon },
  { id: "account", label: "Hesap", icon: UserCircleIcon },
  { id: "product", label: "İlan / Ürün", icon: TagIcon },
  { id: "trade", label: "Takas", icon: ArrowsRightLeftIcon },
  { id: "technical", label: "Teknik Sorun", icon: WrenchScrewdriverIcon },
  { id: "other", label: "Diğer", icon: EllipsisHorizontalCircleIcon },
];

export const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  open: { label: "Açık", className: "bg-info-100 text-info-800" },
  in_progress: {
    label: "İnceleniyor",
    className: "bg-warning-100 text-warning-800",
  },
  waiting_customer: {
    label: "Yanıtınız Bekleniyor",
    className: "bg-primary-100 text-primary-800",
  },
  resolved: { label: "Çözüldü", className: "bg-success-100 text-success-800" },
  closed: { label: "Kapatıldı", className: "bg-surface-alt text-muted" },
};

/** Human category label for a stored category id. */
export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
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

export const HELP_TOPICS: HelpTopic[] = [
  {
    title: "Başlangıç",
    icon: QuestionMarkCircleIcon,
    links: [
      { href: "/guides", label: "Kullanım Kılavuzu" },
      { href: "/faq", label: "Sıkça Sorulan Sorular" },
      { href: "/register", label: "Üye Olun" },
    ],
  },
  {
    title: "Satın Alma",
    icon: ShoppingCartIcon,
    links: [
      { href: "/faq#alisveris-takas", label: "Nasıl Alışveriş Yapılır?" },
      { href: "/payment-options", label: "Ödeme Yöntemleri" },
      { href: "/refund-policy", label: "İade ve İptal Koşulları" },
    ],
  },
  {
    title: "Satış Yapma",
    icon: CurrencyDollarIcon,
    links: [
      { href: "/guides#selling", label: "İlan Verme Rehberi" },
      { href: "/faq#alisveris-takas", label: "Komisyon ve Hizmet Bedelleri" },
      { href: "/membership", label: "Üyelik Planları" },
    ],
  },
  {
    title: "Takas",
    icon: ArrowsRightLeftIcon,
    links: [
      { href: "/secure-swap", label: "Güvenli Takas" },
      { href: "/faq#alisveris-takas", label: "Takas Nasıl Çalışır?" },
      { href: "/profile/trades", label: "Takaslarım" },
    ],
  },
  {
    title: "Kargo ve Teslimat",
    icon: TruckIcon,
    links: [
      { href: "/shipping-delivery", label: "Kargo ve Teslimat" },
      { href: "/faq#alisveris-takas", label: "Kargo Takibi" },
      { href: "/refund-policy", label: "Hasarlı Ürün / İade" },
    ],
  },
  {
    title: "Hesap ve Güvenlik",
    icon: ShieldCheckIcon,
    links: [
      { href: "/profile", label: "Profil ve Adresler" },
      { href: "/support", label: "Destek Talebi Oluştur" },
      { href: "/privacy", label: "Gizlilik Politikası" },
    ],
  },
];

export const POPULAR_TOPICS: { q: string; href: string }[] = [
  { q: "İlk satışımı nasıl yaparım?", href: "/guides#selling" },
  { q: "Ürünlerimi nasıl ön plana çıkartırım?", href: "/faq#populer-konular" },
  { q: "Takas teklifi nasıl gönderirim?", href: "/faq#populer-konular" },
  { q: "Üyelik planları arasındaki farklar nelerdir?", href: "/membership" },
  { q: "Siparişimi nasıl takip ederim?", href: "/faq#populer-konular" },
  { q: "İade ve iptal koşulları nelerdir?", href: "/refund-policy" },
];
