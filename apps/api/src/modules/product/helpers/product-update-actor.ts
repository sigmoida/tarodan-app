/**
 * Bir ilan düzenlemesini KİMİN yaptığı.
 *
 * Gövde iki yolda da aynıdır; ayrışan tek şey KAPILARDIR. Satıcı kendi ilanını
 * düzenler: sahiplik, ban, kurumsal askı, üyelik limitleri ve statü politikası
 * ona uygulanır. Yönetici satıcı ADINA düzeltme yapar: o kapılar geçilmez ve
 * ilanın statüsü değişmez — onaylama/reddetme ayrı uçların işidir.
 *
 * Para, görsel sahipliği ve iyimser kilit gibi BÜTÜNLÜK kuralları aktörden
 * bağımsızdır ve her iki yolda da aynen çalışır.
 */
export type ProductUpdateActor =
  { kind: "seller"; sellerId: string } | { kind: "admin"; adminId: string };
