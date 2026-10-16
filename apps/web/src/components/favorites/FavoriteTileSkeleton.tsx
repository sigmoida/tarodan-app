/** @format */

/**
 * Favori kartının yer tutucusu: sayfa ilk yüklenirken ızgarayı doldurur ve
 * iyimser eklenen (gerçek satırı henüz gelmemiş) favori için yükleniyor kartı
 * olur. Tek yerde ki iki durum aynı görünsün.
 */
export default function FavoriteTileSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-40 animate-pulse rounded bg-border-subtle sm:h-64"
    />
  );
}
