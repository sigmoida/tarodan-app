/**
 * Bir liste API yanıtından dizi çıkarır. Backend bazen `{ data: [...] }`, bazen
 * düz `[...]` döndürüyor; bu helper her iki şekli de tek yerde normalize eder.
 * `res` axios yanıtı ya da doğrudan `res.data` olabilir.
 */
export function extractList<T = any>(res: any): T[] {
  const d = res?.data ?? res;
  const list = d?.data ?? d ?? [];
  return Array.isArray(list) ? list : [];
}
