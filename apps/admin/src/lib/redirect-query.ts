/**
 * Eski liste adreslerini yeni ekranın sekmesine yönlendiren adres üretimi.
 * Eski bağlantının sorgusu (filtreler, arama, sayfa…) AYNEN korunur; yalnız
 * sekmeyi seçen parametre sabitlenir. Server `redirect()` sayfaları Next'in
 * `searchParams` nesnesini, istemci `URLSearchParams`'ı verir — ikisi de olur.
 */

export type QueryInput =
  URLSearchParams | Record<string, string | string[] | undefined> | undefined;

export function toSearchParams(query: QueryInput): URLSearchParams {
  if (query instanceof URLSearchParams) return new URLSearchParams(query);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, item);
    }
  }
  return params;
}

/**
 * `path?<param>=<value>&<sorgunun geri kalanı>`. Sorgudaki çakışan `param`
 * atılır; `value` null ise (varsayılan sekme) parametre hiç yazılmaz.
 */
export function hrefWithPinnedParam(
  path: string,
  param: string,
  value: string | null,
  query?: QueryInput,
): string {
  const params = toSearchParams(query);
  params.delete(param);
  const rest = params.toString();
  const pinned = value === null ? "" : `${param}=${encodeURIComponent(value)}`;
  const qs = [pinned, rest].filter(Boolean).join("&");
  return qs ? `${path}?${qs}` : path;
}
