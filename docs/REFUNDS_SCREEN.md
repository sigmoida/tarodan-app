# Admin İadeler ekranı (API)

`GET /admin/refund-requests` (liste, `tab` + `bucket` + `search` + `dateFrom`/`dateTo` + `kind` +
`sortOrder`), `/counts?tab=` (kova → sayı), `/export` (Excel, `refundRequests`, denetim
`refund_requests_export`). İzin: `refund-requests` → `refund_requests`. Talep dosyası
(`/:id`) değişmedi. Sözleşme ve kova kuralı: `packages/types/src/admin-refund-list.ts`;
`where`: `orders/helpers/refund-list-where.ts`; satır: `refund-list-row.mapper.ts`.

## Satır, sekme, sıra

- **Talep satırı** = `RefundRequest` (RFD-…); kargo öncesi iptalin iadesi de taleptir
  (`kind = cancellation`, politika `*_cancellation`).
- **Takas satırı** = takasın bir TARAFI; takas başına İKİ satır (`initiator` = başlatan,
  `responder` = devam ettiren), `trade.counterpartRefundId` ile eşleşir. Kapsam: tahsil
  edilmiş ödemesi olan ve `returning`/`cancelled`/`disputed` ya da iade izi (iade damgası,
  hata işareti, deneme) taşıyan takas.
- Sekmeler: `all` (hepsi) · `direct` (teklif olmayan sipariş talepleri) · `offer` · `trade`.
- Sıra: iade anı. Talep = `createdAt`; takas = `cancelledAt`, kapanmamış takas en yeni sayılır
  (yeni → eski sırada başta). Takasın tarih süzgeci açık takasta `updatedAt`'i okur.

## Kovalar (her satır tam olarak birinde — contract spec)

| Kova              | Talep                                                                       | Takas                                         |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| `pending_review`  | `pending_review`                                                            | —                                             |
| `rejected`        | `rejected`, `cancelled` (iadesiz kapanış)                                   | —                                             |
| `completed`       | `refunded`                                                                  | `cancelled`/`completed`/`rejected`, sinyal yok |
| `disputed`        | `disputed`                                                                  | `disputed`                                    |
| `refunding`       | açık + süren deneme (`prepared…manual_review`, `failed` dahil) ya da iptal iadesi | hata işareti ya da süren deneme           |
| `at_warehouse`    | açık iade + (`return_delivered` ya da iade kargosu `delivered`)             | `at_warehouse`/`admin_reviewing`/`returning`  |
| `awaiting_return` | kalan açık iade (kargo yok / yolda)                                         | kalan                                         |

Açık = `approved`, `wait_for_delivery`, `return_shipment_open`, `return_in_transit`,
`return_delivered`. Deneme talebe `refund-request:<id>` anahtarıyla bağlı (FK yok): süren
denemelerin talep id'leri önce okunur, kova `where`'i onları kullanır.

## Kolon → kaynak

| Kolon                        | Talep                                                       | Takas (taraf)                                              |
| ---------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| İade No                      | `refundNumber`                                              | `TKS-…-INI` / `TKS-…-REC` (türetilmiş)                     |
| Sipariş No / paket takip     | `Order.orderNumber`, gidiş `Shipment` (taşıyıcı kodu önce)  | takas no; tarafın `to_warehouse` bacağı                   |
| Alıcı / Satıcı               | sipariş alıcısı (misafir çözümü) / satıcı                   | bu taraf / karşı taraf                                     |
| Birim fiyat                  | `Order.unitPrice`                                           | taraf ürünlerinin `valueAtTrade × adet` toplamı            |
| Komisyon (oran/tutar)        | satıcı + alıcı komisyonu (KDV hariç) ÷ `subtotal`           | hizmet bedeli (`tradeServiceFeeOf`), oran yok              |
| İade edilecek komisyon       | bileşenlerde sahibine dönen `*_commission` (net) ÷ birim×iade adedi | `refundedServiceFeeOf` (yalnız kusursuz taraf)     |
| İlan / teklif komisyonu      | teklif: etkin oran × ilan fiyatı / gerçek komisyon          | —                                                          |
| Fiyat farkı                  | teklif: ilan − teklif (`compareOfferToListing`)             | + taraf farkı ödedi / − fark ona ödenecekti                |
| Alıcı / satıcı kesintisi     | `buyer_charge` / `seller_charge` brüt toplamı               | tahsil − iade (bırakılmamış ödeme); satıcı kesintisi 0     |
| İade tutarı / durumu         | `RefundRequest.amount`; deneme + `refundedAt`               | deneme toplamı ya da `tradePaymentRefundableAmountFor`     |
| İade kargosu                 | `returnProviderTrackingId ?? returnTrackingNumber`, `returnStatus` | tarafa dönen `return` bacağı                        |
| Depo (yalnız takas)          | —                                                           | varış = `to_warehouse` durumu; karar = iade bacağı → ret, `from_warehouse` → onay; çıkış = `return.shippedAt` |
| Neden                        | `resolvedReason ?? reason` + `description`                  | `adminCancelReasonCode` + `cancelReason`                   |
| İade faturası                | `return_invoice`, `sourceId = <fatura>:<denemeId>`          | tarafın `trade_*` belgesinin `return_invoice`'u            |

## VERIFY / açık kalemler

1. **Takas iade no ve ORD no**: takasın sipariş/iade kaydı yok; numara türetildi (şema
   değişikliği yok). Müşteri "kendi ORD no"su istiyor — kalıcı numara gerekirse ayrı karar.
2. **İlan fiyatı komisyonu** hesaplanmadı, teklifin etkin oranıyla izdüşürüldü (min/maks
   sınırları yansımaz). Kesin değer istenirse kabul anında snapshot'a yazılmalı.
3. **Komisyon oranı** kural oranı değil, etkin orandır (snapshot'ta oran yok).
4. **Depo etiketi URL'i** yok (yalnız ZPL); `outboundLabelUrl` hep null.
5. Bir deneme birden çok belgeyi terslerse satır İLK iade faturasını gösterir; e-Arşiv iptal
   yoluyla kapanan belgede iade faturası yoktur (null). Eski tam iade anahtarı (`<fatura>`)
   talebe bağlanamaz.
6. `cancelled` talep "Reddedilen"de; takasta deneme açılmadan önceki kısa an "Tamamlanan"da.
7. Liste yalnız iade anına göre sıralanır (eski `sortBy` alanları kalktı); `status`,
   `userSearch`, `from`/`to` parametreleri yerine `bucket`, `search`, `dateFrom`/`dateTo`.
