/** @format */

import { BoltIcon } from "@heroicons/react/24/outline";

const TIPS = [
  "Ürün fotoğraflarınızı kaliteli ve farklı açılardan çekin",
  "Başlıklarda marka ve model bilgilerini eksiksiz yazın",
  "Piyasa fiyatlarını araştırarak rekabetçi fiyat belirleyin",
];

export default function TipsSection() {
  return (
    <div className="rounded-lg border border-info-100 bg-info-50 p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-info-100 p-3">
          <BoltIcon className="h-6 w-6 text-info-600" />
        </div>
        <div>
          <h3 className="mb-2 font-semibold text-heading">
            💡 Performans İpuçları
          </h3>
          <div className="grid gap-4 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3">
            {TIPS.map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="font-bold text-info-500">{i + 1}.</span>
                <p>{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
