/** @format */

/**
 * SectionCard'ın GÖVDESİ `@tarodan/ui`'ye taşındı: ilan formu artık hem
 * vitrinde hem yönetici panelinde çalışıyor ve bir paket, bir uygulamanın
 * içinden import edemez.
 *
 * Bu dosya eski yolu ayakta tutar — mevcut ~50 çağrı yerinin tek satırı bile
 * değişmesin diye. Alt yol (`/section-card`) BİLEREK: paketin barrel'ı
 * `useState` taşıyan istemci bileşenlerini sunucu zincirine sürüklüyor.
 */
export { default } from "@tarodan/ui/section-card";
export type { SectionCardProps } from "@tarodan/ui/section-card";
