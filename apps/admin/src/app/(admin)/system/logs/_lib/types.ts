import {
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  EnvelopeIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";

export type LogTab = "errors" | "security" | "emails" | "audit";

export interface ErrorLog {
  id: string;
  severity: string;
  message: string;
  stackTrace?: string;
  source: string;
  endpoint?: string;
  userId?: string;
  requestId?: string;
  metadata?: {
    status?: number;
    name?: string;
    causes?: string[];
    response?: any;
    ip?: string;
    userAgent?: string;
    body?: any;
  };
  createdAt: string;
}

export interface SecurityLog {
  id: string;
  eventType: string;
  severity: string;
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  details?: Record<string, any>;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface EmailLog {
  id: string;
  messageId?: string;
  to: string;
  from: string;
  subject: string;
  template?: string;
  status: string;
  provider: string;
  userId?: string;
  errorMessage?: string;
  sentAt?: string;
  deliveredAt?: string;
  bouncedAt?: string;
  openedAt?: string;
  clickedAt?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminUserId: string;
  admin?: { id: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  createdAt: string;
}

export type AnyLog = ErrorLog | SecurityLog | EmailLog | AuditLog;

export const LOG_TABS: {
  key: LogTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    key: "errors",
    label: "Hata Logları",
    icon: ExclamationTriangleIcon,
    description:
      "API isteklerinde oluşan HTTP 4xx/5xx hataları, stack trace ve request detayları",
  },
  {
    key: "security",
    label: "Güvenlik Logları",
    icon: ShieldExclamationIcon,
    description:
      "Başarısız girişler, IP engellemeleri ve şüpheli aktivite gibi güvenlik olayları",
  },
  {
    key: "emails",
    label: "E-posta Logları",
    icon: EnvelopeIcon,
    description:
      "Sistem tarafından gönderilen tüm e-postaların gönderim durumu ve teslim bilgileri",
  },
  {
    key: "audit",
    label: "Denetim Logları",
    icon: ClipboardDocumentIcon,
    description:
      "Admin kullanıcıların yaptığı işlemler — kim, ne zaman, hangi kaydı değiştirdi",
  },
];

export const severityColors: Record<string, string> = {
  critical: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  high: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  error: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  medium: "bg-warning-500/10 text-warning-700 border-warning-500/20",
  warning: "bg-warning-500/10 text-warning-700 border-warning-500/20",
  low: "bg-info-500/10 text-info-700 border-info-500/20",
};

export const statusColors: Record<string, string> = {
  sent: "bg-success-500/10 text-success-700",
  delivered: "bg-success-500/10 text-success-700",
  queued: "bg-warning-500/10 text-warning-700",
  bounced: "bg-danger-500/10 text-danger-600",
  failed: "bg-danger-500/10 text-danger-600",
};

export const eventTypeLabels: Record<string, string> = {
  failed_login: "Başarısız Giriş",
  ip_block: "IP Engelleme",
  suspicious_activity: "Şüpheli Aktivite",
  password_reset: "Şifre Sıfırlama",
  "2fa_enabled": "2FA Aktif",
  account_locked: "Hesap Kilitlendi",
};

export const ACTION_LABELS: Record<string, string> = {
  user_ban: "Kullanıcı Banlandı",
  user_unban: "Ban Kaldırıldı",
  product_approve: "Ürün Onaylandı",
  product_reject: "Ürün Reddedildi",
  product_delete: "Ürün Silindi",
  order_update: "Sipariş Güncellendi",
  payment_refund: "Ödeme İadesi",
  category_create: "Kategori Oluşturuldu",
  category_update: "Kategori Güncellendi",
  category_delete: "Kategori Silindi",
  commission_rule_create: "Komisyon Kuralı Oluşturuldu",
  commission_rule_update: "Komisyon Kuralı Güncellendi",
  commission_rule_delete: "Komisyon Kuralı Silindi",
  trade_resolve: "Takas Çözümlendi",
  message_approve: "Mesaj Onaylandı",
  message_reject: "Mesaj Reddedildi",
};

export const ENTITY_LABELS: Record<string, string> = {
  User: "Kullanıcı",
  Product: "Ürün",
  Order: "Sipariş",
  Payment: "Ödeme",
  Category: "Kategori",
  CommissionRule: "Komisyon Kuralı",
  Trade: "Takas",
  Message: "Mesaj",
  SupportTicket: "Destek Talebi",
};

export const SEARCH_PLACEHOLDERS: Record<LogTab, string> = {
  errors: "Hata mesajı ara...",
  security: "Olay / IP / e-posta ara...",
  emails: "Alıcı / konu ara...",
  audit: "İşlem / admin ara...",
};

export const EMPTY_TEXT: Record<LogTab, string> = {
  errors: "Hata logu bulunamadı",
  security: "Güvenlik logu bulunamadı",
  emails: "E-posta logu bulunamadı",
  audit: "Denetim logu bulunamadı",
};

export function formatDate(date: string) {
  return new Date(date).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
