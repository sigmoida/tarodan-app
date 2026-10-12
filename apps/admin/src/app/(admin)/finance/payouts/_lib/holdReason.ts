/**
 * Hold satırının "serbest bırakılabilir mi / neden değil" rozeti.
 *
 * Karar SUNUCUDADIR (`releasable` + `releaseBlockedReason`): iade donması, vade,
 * sipariş durumu ve satıcı kusuru orada hesaplanır. Bu modül yalnız sunumdur —
 * sebep → etiket / ton eşlemesi; hiçbir tarih ya da durum burada yeniden
 * değerlendirilmez.
 */

export type HoldReleaseBlockedReason =
  | "frozen"
  | "not_due"
  | "order_not_terminal"
  | "seller_at_fault"
  | "already_released";

/** Hold satırının sunucudan gelen serbest bırakma alanları. */
export interface HoldReleaseFlags {
  releasable?: boolean;
  releaseBlockedReason?: HoldReleaseBlockedReason | null;
}

export type HoldReasonTone = "success" | "warning" | "danger" | "outline";

export interface HoldReasonView {
  code: "releasable" | HoldReleaseBlockedReason;
  tone: HoldReasonTone;
  /** `admin.finance.payouts.holdReasons.<code>.label|detail` */
  labelKey: string;
  detailKey: string;
}

const PREFIX = "admin.finance.payouts.holdReasons";

const TONE: Record<HoldReasonView["code"], HoldReasonTone> = {
  releasable: "success",
  not_due: "outline",
  frozen: "warning",
  order_not_terminal: "outline",
  seller_at_fault: "danger",
  already_released: "outline",
};

const view = (code: HoldReasonView["code"]): HoldReasonView => ({
  code,
  tone: TONE[code],
  labelKey: `${PREFIX}.${code}.label`,
  detailKey: `${PREFIX}.${code}.detail`,
});

/**
 * `releasable` açıksa "Serbest bırakılabilir"; değilse sunucunun verdiği engel
 * sebebi. Sunucu alanı hiç göndermediyse (eski yanıt) `null` → rozet çizilmez.
 */
export function holdReasonView(flags: HoldReleaseFlags): HoldReasonView | null {
  if (flags.releasable) return view("releasable");
  return flags.releaseBlockedReason ? view(flags.releaseBlockedReason) : null;
}

/**
 * Düğme durumu: `release` = vadesi gelmiş normal bırakma, `early` = yalnız vade
 * engeli kalmış (süper admin erken bırakır), `none` = düğme yok. Yalnız sunucu
 * alanlarını okur.
 */
export function holdReleaseAction(
  flags: HoldReleaseFlags,
): "release" | "early" | "none" {
  if (flags.releasable) return "release";
  const reason = flags.releaseBlockedReason;
  if (reason === "not_due") return "early";
  return "none";
}
