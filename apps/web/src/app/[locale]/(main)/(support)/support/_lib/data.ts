import type { ComponentType, SVGProps } from "react";
import {
  TruckIcon,
  CreditCardIcon,
  UserCircleIcon,
  TagIcon,
  ArrowsRightLeftIcon,
  WrenchScrewdriverIcon,
  EllipsisHorizontalCircleIcon,
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
