import { type Report, type ReportStatus } from "./types";

/**
 * `GET /user-reports/admin/:id` yanıtı: liste satırının üstüne şikayet edilen
 * içeriğin kendisini ekler. Hedef türe göre farklı şekildedir ve silinmiş
 * içerikte `{ id, deleted: true }` döner — bu yüzden her alan opsiyoneldir.
 */
export interface ReportTarget {
  id: string;
  deleted?: boolean;
  /** product */
  title?: string;
  status?: string;
  seller?: { id: string; displayName: string };
  /** user */
  displayName?: string;
  email?: string;
  isBanned?: boolean;
  /** collection */
  name?: string;
  user?: { id: string; displayName: string };
  /** message */
  content?: string;
  sender?: { id: string; displayName: string };
}

export interface ReportDetail extends Report {
  target?: ReportTarget | null;
}

/** Durum seçenekleri — modalda "yeni durum" listesi. */
export function reportStatusChoices(
  labels: Record<string, { label: string }>,
): { value: ReportStatus; label: string }[] {
  return (
    ["pending", "under_review", "resolved", "dismissed"] as ReportStatus[]
  ).map((value) => ({ value, label: labels[value]?.label ?? value }));
}

/**
 * Kapanış durumları: yalnız bunlarda şikayet edene bildirim + e-posta gider
 * (API `updateReportStatus`). Modal, açıklama alanının uyarısını buna göre
 * gösterir — "iç not mu, kullanıcıya gidiyor mu?" belirsizliği kalmasın.
 */
export const CLOSING_STATUSES: ReportStatus[] = ["resolved", "dismissed"];

/** Hedef içeriğin admin panelindeki (yoksa web'deki) adresi. */
export function targetHref(report: ReportDetail): string | null {
  if (!report.target || report.target.deleted) return null;
  switch (report.type) {
    case "product":
      return `/catalog/products/${report.targetId}`;
    case "user":
      return `/accounts/users/${report.targetId}`;
    default:
      // Koleksiyon ve mesajın admin panelinde tekil sayfası yok.
      return null;
  }
}
