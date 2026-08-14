/** @format */

import type { DailyPoint } from "../_lib/types";

/**
 * Daily-views bar chart with hover tooltips.
 *
 * Çubuklar ve tarih etiketleri AYRI iki satır: etiketler `-rotate-45` ile
 * döndürüldüğü için son sütunda grafiğin sağ kenarını aşıyor ve sayfayı yatay
 * kaydırılabilir yapıyordu. Kırpma yalnız etiket bandına uygulanıyor — kırpmayı
 * grafiğin tamamına vermek, çubuğun üstünde açılan ve bir sütundan çok daha
 * geniş olan ipucu balonunu da kesiyordu (ilk ve son çubukta yarısı gidiyordu).
 */
export default function SimpleBarChart({ data }: { data: DailyPoint[] }) {
  const maxViews = Math.max(...data.map((d) => d.views), 1);

  return (
    <div>
      <div className="flex h-48 items-end gap-1">
        {data.map((item, i) => (
          <div
            key={i}
            className="group relative flex-1 cursor-pointer rounded-t-lg bg-gradient-to-t from-primary-500 to-primary-400 transition-colors hover:from-primary-600 hover:to-primary-500"
            style={{
              height: `${(item.views / maxViews) * 100}%`,
              minHeight: "8px",
            }}
          >
            {/*
              `opacity-0` DEĞİL `hidden`: saydamlığı sıfır olan bir kutu hâlâ
              yerleştiriliyor ve genişliğiyle sayfanın kaydırma alanını
              büyütüyordu. Görünmeyen bir öğe düzeni etkilememeli.
            */}
            <div className="absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-heading px-2 py-1 text-xs text-inverted group-hover:block">
              {item.views} görüntüleme
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1 flex gap-1 overflow-x-clip">
        {data.map((item, i) => (
          <span
            key={i}
            className="w-8 flex-1 origin-top-left -rotate-45 truncate text-2xs text-subtle"
          >
            {new Date(item.date).toLocaleDateString("tr-TR", {
              day: "numeric",
              month: "short",
            })}
          </span>
        ))}
      </div>
    </div>
  );
}
