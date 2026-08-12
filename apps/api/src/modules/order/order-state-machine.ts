import { OrderStatus } from "@prisma/client";

export type OrderTransitionActor = "buyer" | "seller" | "system";

export interface OrderTransitionRule {
  to: OrderStatus;
  allowedBy: OrderTransitionActor;
}

/**
 * Canonical order state graph — hangi statü geçişlerinin YAPISAL olarak geçerli
 * olduğunun ve hangi aktörün tetikleyebileceğinin kaydı.
 *
 * KAPSAM (dürüst olmak zorundayız): siparişte, kargo tarafındaki
 * `canTransitionShipmentStatus` gibi TÜM yazarların geçtiği tek bir kapı
 * YOKTUR. Statü, para/stok yan etkilerini taşıyan KOMUTLAR tarafından yazılır
 * (ödeme tamamlama, iptal, iade finalize, teslim handler'ı, cron'lar) ve her
 * biri kendi koşullu-atomik guard'ını uygular — ör. kargoya veriliş yalnız
 * SHIPPABLE_ORDER_STATUSES'tan, teslim yalnız terminal-olmayan statüden.
 * Bu tablo o komutların ürettiği gerçek kenarların kaydıdır; genel bir
 * "statü setter" ucu yoktur (vardı, ölüydü ve kaldırıldı — yanlış bir
 * güvenlik hissi veriyordu).
 *
 * Yeni bir kenar üreten komut eklerken BURAYI da güncelle; tablo ile kodun
 * ayrışması, denetimde "grafikte olmayan geçiş" olarak geri döner.
 */
export const ORDER_TRANSITION_RULES: Record<
  OrderStatus,
  OrderTransitionRule[]
> = {
  [OrderStatus.pending_payment]: [
    { to: OrderStatus.paid, allowedBy: "system" },
    { to: OrderStatus.preparing, allowedBy: "system" },
    { to: OrderStatus.cancelled, allowedBy: "buyer" },
  ],
  [OrderStatus.paid]: [
    { to: OrderStatus.preparing, allowedBy: "seller" },
    // Kargoya veriliş (satıcı takip girişi / Sürat ilk hareket / admin) —
    // SHIPPABLE_ORDER_STATUSES `paid`'i de kapsar.
    { to: OrderStatus.shipped, allowedBy: "system" },
    // Kargo öncesi alıcı iptali (İPTAL tipi) — cancel() komutu üzerinden; tam
    // PSP iadesiyle birlikte processRefund siparişi cancelled yazar.
    { to: OrderStatus.cancelled, allowedBy: "buyer" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.preparing]: [
    { to: OrderStatus.shipped, allowedBy: "system" },
    // Taşıyıcı teslimi raporladığında ilk-hareket geçişi kaçırılmış olabilir
    // (poll penceresi/bilinmeyen kod): teslim handler'ı statüyü doğrudan
    // ilerletir — taşıyıcı gerçeği kaybedilmez.
    { to: OrderStatus.delivered, allowedBy: "system" },
    { to: OrderStatus.awaiting_buyer_confirmation, allowedBy: "system" },
    // Alıcı kargo öncesi iptali + "satıcı kargolamadı" zaman aşımı (cron).
    { to: OrderStatus.cancelled, allowedBy: "buyer" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.shipped]: [
    { to: OrderStatus.delivered, allowedBy: "system" },
    // FEATURE_48H_CONFIRMATION_WINDOW açıkken teslim `delivered` yerine
    // `awaiting_buyer_confirmation` yazar (handleOrderDelivered).
    { to: OrderStatus.awaiting_buyer_confirmation, allowedBy: "system" },
    // Dönüş kargosu açıldığında sipariş iade akışına işaretlenir (Sürat sync).
    { to: OrderStatus.refund_requested, allowedBy: "system" },
    // Kargoya verildikten sonra ALICI iptali yoktur; ancak iade finalize'ı
    // (tam iade) siparişi kapatır.
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.delivered]: [
    { to: OrderStatus.completed, allowedBy: "buyer" },
    { to: OrderStatus.refund_requested, allowedBy: "system" },
    // Tam tutarlı iade finalize olduğunda tek yazıcı processRefund'dur ve
    // siparişi cancelled kapatır (kısmi adet iadesinde sipariş açık kalır).
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.awaiting_buyer_confirmation]: [
    { to: OrderStatus.completed, allowedBy: "buyer" },
    { to: OrderStatus.completed, allowedBy: "system" },
    { to: OrderStatus.refund_requested, allowedBy: "buyer" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  // Erken onaylanmış sipariş, teslimat + 14 günlük cayma penceresi içinde
  // hâlâ iadeye açılabilir; bu çıkışlar YALNIZ sistem iade akışının çıktısıdır
  // (kullanıcı genel statü ucundan tetikleyemez).
  [OrderStatus.completed]: [
    { to: OrderStatus.refund_requested, allowedBy: "system" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  // Kabul edilen teklifin ödeme penceresi kaçtığında sipariş iptal olur;
  // satıcı teklifi yeniden aktifleştirirse AYNI sipariş taze 24 saatlik
  // pencereyle ödemeye geri döner (reactivate). Tek diriltme kenarı budur.
  [OrderStatus.cancelled]: [
    { to: OrderStatus.pending_payment, allowedBy: "seller" },
  ],
  [OrderStatus.refund_requested]: [
    { to: OrderStatus.refunded, allowedBy: "system" },
    { to: OrderStatus.cancelled, allowedBy: "system" },
  ],
  [OrderStatus.refunded]: [],
};

/**
 * Kargoya veriliş (`shipped`) YAZILABİLİR statüler — TEK KAYNAK.
 *
 * "Kargoya verildikten sonra iptal edilemez" kuralının AYNASI: iptal/iade ile
 * kapanmış bir sipariş kargoya verilmiş olarak İŞARETLENEMEZ. Aksi halde
 * kapanmış sipariş `shipped`'e diriltilip teslim akışına girer ve escrow'a
 * release tarihi kurulur — kısmi iade sonrası satıcıya para gider (alıcı
 * siparişi iptal edilmiş sanarken).
 *
 * Üç yazar da bu listeye uyar: satıcı takip girişi (shipping.service),
 * Sürat ilk-hareket poll'u (order-tracking-sync) ve admin takip girişi
 * (admin-analytics-order; o daha da dar: yalnız `preparing`).
 */
export const SHIPPABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.preparing,
];

/**
 * Kullanıcı akışları için terminal statüler. `completed` kullanıcı statü
 * geçişleri için terminaldir; cayma penceresi içindeki SİSTEM iade akışı
 * (yukarıdaki system kenarları) bunun bilinçli istisnasıdır.
 */
export const ORDER_TERMINAL_STATUSES: readonly OrderStatus[] = [
  OrderStatus.completed,
  OrderStatus.cancelled,
  OrderStatus.refunded,
];

/** Structural check: is there ANY rule allowing `from` → `to` (actor ignored)? */
export function isOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return true;
  return (ORDER_TRANSITION_RULES[from] ?? []).some((r) => r.to === to);
}

/**
 * The generic admin setter is deliberately narrow. Money-changing transitions
 * (cancel/refund/complete) have dedicated commands that run their stock, PSP,
 * ledger and invoice side effects. Shipping requires a tracking command.
 */
export function isAdminOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return true;
  return (
    (from === OrderStatus.paid && to === OrderStatus.preparing) ||
    (from === OrderStatus.shipped && to === OrderStatus.delivered)
  );
}
