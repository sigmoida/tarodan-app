/** @format */

/**
 * Header ikonlarının sayaç rozeti — mesaj, bildirim ve sepet için TEK tanım.
 *
 * Üçü de aynı görünmeli: aynı boyut, aynı renk, aynı kısaltma eşiği. Sınıf
 * dizisi üç yere kopyalandığında sepetinki ayrışmıştı (dolu kırmızı yerine
 * açık zemin, bir punto büyük yazı ve 99 yerine 9'da kısaltma), yani aynı
 * çubuktaki üç rozet birbirini tutmuyordu.
 *
 * Konumlandırma da buraya dahildir: rozet, `relative` bir ikon düğmesinin
 * sağ üst köşesine oturur. Çağıranın yapması gereken tek şey düğmeyi
 * `relative` bırakmak.
 */
export default function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-500 px-1 text-2xs font-semibold text-inverted">
      {count > 99 ? "99+" : count}
    </span>
  );
}
