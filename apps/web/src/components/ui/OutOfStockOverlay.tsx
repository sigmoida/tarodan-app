/**
 * Stoğu biten ürün kartlarında görselin üstünde gösterilen "Stokta yok" katmanı.
 * Görselin opacity'sini düşürmek çağıran tarafın sorumluluğundadır (ör. img'e `opacity-50`).
 * Konumlandırma için kapsayan öğenin `relative` olması gerekir.
 */
export default function OutOfStockOverlay({
  label = "STOKTA YOK",
}: {
  label?: string;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span className="bg-heading/70 text-inverted text-2xs font-extrabold tracking-wide px-2.5 py-1 rounded">
        {label}
      </span>
    </div>
  );
}
