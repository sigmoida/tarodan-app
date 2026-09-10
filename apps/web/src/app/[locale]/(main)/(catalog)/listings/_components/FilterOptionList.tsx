"use client";

import { useMemo, useState } from "react";
import { Checkbox, Input, Radio, matchesSearch } from "@tarodan/ui";

export interface FilterOption {
  /** Liste anahtarı — aynı zamanda seçimin karşılaştırma değeri. */
  value: string;
  label: string;
  /** Katalog kimliği; id + ad ikilisiyle çalışan filtreler (marka, üretici). */
  id?: string;
  /** Renk noktası gösterilecek seçenekler için HEX. */
  color?: string | null;
  /** Sağda gösterilen ilan sayısı. */
  count?: number;
}

/** Arama kutusu bu uzunluğun ÜSTÜNDEKİ listelerde çıkar. */
const SEARCH_AFTER = 8;
/** Bu uzunluğun üstündeki listeler kendi içlerinde kaydırılır. */
const SCROLL_AFTER = 8;

interface FilterOptionListProps {
  options: FilterOption[];
  isSelected: (option: FilterOption) => boolean;
  onSelect: (option: FilterOption) => void;
  /**
   * Radyo grubunun adı. Verildiğinde liste TEK seçimlidir (radio); verilmezse
   * çoklu seçim (checkbox) olur — renk ve özel özellik grupları böyle çalışır.
   */
  name?: string;
  searchPlaceholder: string;
  emptyText: string;
}

/**
 * Kenar filtrelerindeki her seçenek listesinin TEK gövdesi: arama kutusu +
 * yükseklik sınırlı kaydırılabilir liste + "sonuç yok" durumu.
 *
 * Bu bileşen olmadan her bölüm kendi listesini kopyalıyordu ve sınır koymak
 * tek tek hatırlanması gereken bir ayrıntıydı: yalnız "Model" bölümünde
 * `max-h` vardı, üretici bölümü ise yüzlerce satırla sayfayı metrelerce
 * uzatıyordu. Sınır artık listenin kendisine ait; yeni bir filtre eklemek onu
 * unutturamaz.
 *
 * Arama durumu da burada tutulur — bölümün dışında kimsenin işine yaramıyordu
 * ve altı ayrı `useState` sayfanın durumuna taşınmıştı. Kısa listelerde kutu
 * hiç çıkmaz (3 araç türü için arama kutusu gürültüdür).
 */
export default function FilterOptionList({
  options,
  isSelected,
  onSelect,
  name,
  searchPlaceholder,
  emptyText,
}: FilterOptionListProps) {
  const [search, setSearch] = useState("");

  const visible = useMemo(
    () =>
      search ? options.filter((o) => matchesSearch(o.label, search)) : options,
    [options, search],
  );

  const showSearch = options.length > SEARCH_AFTER;
  const scrolls = options.length > SCROLL_AFTER;

  return (
    <>
      {showSearch && (
        <Input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputSize="sm"
          className="mb-2 rounded border-border focus:border-primary-400"
        />
      )}

      {visible.length === 0 ? (
        <p className="px-2 py-3 text-center text-sm text-muted">{emptyText}</p>
      ) : (
        <div
          className={`space-y-1 ${
            scrolls ? "max-h-64 overflow-y-auto overscroll-contain pr-1" : ""
          }`}
        >
          {visible.map((option) => {
            const selected = isSelected(option);
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors ${
                  selected
                    ? "bg-primary-100 text-primary-700"
                    : "text-body hover:bg-surface"
                }`}
              >
                {name ? (
                  <Radio
                    name={name}
                    checked={selected}
                    onChange={() => onSelect(option)}
                    className="h-4 w-4 text-primary-500 focus:ring-primary-400"
                  />
                ) : (
                  <Checkbox
                    checked={selected}
                    onChange={() => onSelect(option)}
                    className="h-4 w-4"
                  />
                )}
                {option.color && (
                  <span
                    className="h-3 w-3 flex-shrink-0 rounded-full border border-border-subtle"
                    style={{ backgroundColor: option.color }}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate text-sm">{option.label}</span>
                {option.count != null && (
                  <span className="ml-auto flex-shrink-0 text-xs tabular-nums text-subtle">
                    {option.count}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}
