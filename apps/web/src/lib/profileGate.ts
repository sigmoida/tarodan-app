/** @format */

import { queryKeys } from "@/lib/query/keys";
import {
  evaluateDispatchAddress,
  type DispatchAddressCandidate,
} from "./dispatchAddress";
import { safeReturnTo, withReturnTo } from "./returnTo";

/**
 * Profil sayfasındaki "kapı" bölümleri — TEK kaynak:
 *  - `anchor`: bölümün `id=`'si ve ona giden linkin `#`'i,
 *  - `queryKey`: kapının okuduğu cache (kayıttan sonra dönmeden önce tazelenir),
 *  - `isOpen`: o cache'e göre kapı gerçekten açıldı mı (bölüm kaydı yetmez:
 *    ör. adres eklendi ama çıkış adresi hâlâ kullanılamazsa kapı kapalı kalır).
 */
export const PROFILE_GATE = {
  bank: {
    anchor: "bank-account",
    queryKey: queryKeys.bankAccount.detail(),
    isOpen: (data: unknown) => !!data,
  },
  address: {
    anchor: "addresses",
    queryKey: queryKeys.addresses.all(),
    isOpen: (data: unknown) =>
      evaluateDispatchAddress(data as DispatchAddressCandidate[] | null)
        .hasDispatchAddress,
  },
} as const;

export type ProfileGateSection = keyof typeof PROFILE_GATE;

const GATE_PARAM = "gate";

/**
 * Eksik bilgiyi tamamlatıp geri döndüren profil linki:
 * `/profile?returnTo=/listings/new&gate=bank#bank-account`. `gate`, dönüşün
 * yalnız o kapıdan gelen kullanıcıya uygulanmasını sağlar. `returnTo` yoksa
 * düz bölüm linki (dönüş yok).
 */
export function profileGateHref(
  section: ProfileGateSection,
  returnTo: string | null,
): string {
  const anchor = PROFILE_GATE[section].anchor;
  if (!returnTo) return `/profile#${anchor}`;
  return `${withReturnTo("/profile", returnTo)}&${GATE_PARAM}=${section}#${anchor}`;
}

/** `search` (`?returnTo=…&gate=…`) bu kapıdan geldiyse güvenli `returnTo`, yoksa null. */
export function parseGateReturnTo(
  search: string,
  section: ProfileGateSection,
): string | null {
  const params = new URLSearchParams(search);
  if (params.get(GATE_PARAM) !== section) return null;
  return safeReturnTo(params.get("returnTo"));
}

/** Geçerli URL için `parseGateReturnTo` (yalnız istemcide). */
export function readGateReturnTo(section: ProfileGateSection): string | null {
  if (typeof window === "undefined") return null;
  return parseGateReturnTo(window.location.search, section);
}

/** Akış sayfaları (ödeme vb.) "adres ekle, sonra dön" için uygun hedef değil. */
const NON_RETURN_PATH =
  /^\/(checkout|payment|cart\/payment|membership\/checkout)(\/|$)/;

/** Mevcut sayfa `returnTo` olabilir mi; olamıyorsa `null` (düz profil linki). */
export function gateReturnTarget(
  pathname: string | null | undefined,
): string | null {
  const safe = safeReturnTo(pathname);
  return safe && !NON_RETURN_PATH.test(safe) ? safe : null;
}
