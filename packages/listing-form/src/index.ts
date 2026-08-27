/** @format */

/**
 * @tarodan/listing-form — ilan oluşturma ve düzenleme formunun TAMAMI.
 *
 * Vitrindeki satıcı formu ile yönetici panelindeki düzenleme ekranı AYNI
 * kartları, AYNI şemayı ve AYNI görsel yükleme kuyruğunu kullanır. İki
 * uygulamada ayrı ayrı durduğunda bir kuralı değiştirmek iki yerde
 * değiştirmek demekti ve ikisi sessizce ayrışırdı.
 *
 * Uygulamaya bağlı olan tek şey sunucuya nasıl gidildiğidir: `ListingFormApi`
 * portu ile verilir.
 */
export * from "./form";
export * from "./edit/build-edit-form-data";
export * from "./edit/selected-option";
export * from "./edit/build-update-payload";
export * from "./edit/to-values";
export * from "./edit/schema";
// `edit/types` içindeki Category/Brand/CarModel, `form/constants` ile aynı
// adları taşıyor. Formun kullandığı katalog tipleri oradan gelir; buradan
// yalnız düzenleme YÜKÜNE ait tipler dışarı verilir.
export type {
  ListingEditAttribute,
  ListingEditImage,
  ListingEditPayload,
  EditListingFormData,
} from "./edit/types";
