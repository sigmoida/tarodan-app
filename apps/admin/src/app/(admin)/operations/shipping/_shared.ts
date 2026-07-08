import type { StatusConfig } from "@tarodan/ui";

// ─── ShipmentStatus enum mapping ─────────────────────────────────────────────
// Orders (Shipment.status), trades (TradeShipment.status) and refunds
// (RefundRequest.returnStatus) all use the same `ShipmentStatus` enum.
export const shipmentStatusConfig: Record<string, StatusConfig> = {
  pending: { label: "Beklemede", variant: "secondary" },
  label_created: { label: "Etiket Oluşturuldu", variant: "secondary" },
  picked_up: { label: "Alındı", variant: "info" },
  in_transit: { label: "Yolda", variant: "info" },
  at_delivery_branch: { label: "Şubede", variant: "info" },
  out_for_delivery: { label: "Dağıtımda", variant: "info" },
  delivered: { label: "Teslim Edildi", variant: "success" },
  failed: { label: "Başarısız", variant: "danger" },
  return_in_progress: { label: "İade Süreci", variant: "warning" },
  returned: { label: "İade Edildi", variant: "secondary" },
  cancelled: { label: "İptal", variant: "danger" },
};

// Status filter options — shared by the Orders and Trades tabs.
export const statusOptions: { value: string; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "pending", label: "Beklemede" },
  { value: "label_created", label: "Etiket Oluşturuldu" },
  { value: "picked_up", label: "Alındı" },
  { value: "in_transit", label: "Yolda" },
  { value: "at_delivery_branch", label: "Şubede" },
  { value: "out_for_delivery", label: "Dağıtımda" },
  { value: "delivered", label: "Teslim Edildi" },
  { value: "failed", label: "Başarısız" },
  { value: "return_in_progress", label: "İade Süreci" },
  { value: "returned", label: "İade Edildi" },
  { value: "cancelled", label: "İptal" },
];

// ─── Trade direction (leg) options ───────────────────────────────────────────
export const legOptions: { value: string; label: string }[] = [
  { value: "all", label: "Tüm Yönler" },
  { value: "to_warehouse", label: "Depoya" },
  { value: "from_warehouse", label: "Kullanıcıya" },
  { value: "return", label: "İade" },
];

export const legLabels: Record<string, string> = {
  to_warehouse: "Depoya",
  from_warehouse: "Kullanıcıya",
  return: "İade",
};

// ─── Date helpers ────────────────────────────────────────────────────────────

/** "just now" / "5 min ago" / "3 hr ago" / "2 days ago" / full date */
export function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} gün önce`;
  return d.toLocaleDateString("tr-TR");
}

/** ISO date as tr-TR short date; "—" if empty/null */
export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR");
}
