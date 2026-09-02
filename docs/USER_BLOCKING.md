# Kullanıcı Engelleme & Şikayet — API sözleşmesi

Apple App Review'ın UGC şartı için tek kaynak. Web ve mobil **aynı uçları**
kullanır; engelleme kalıcı (`user_blocks`) ve **simetriktir**: iki taraf
birbirinin ilan/koleksiyon/profilini görmez; mesaj, teklif ve takas iki yönlü
kapanır. Modül: `apps/api/src/modules/user-block`.

## Uçlar (JWT gerekli)

| Uç                        | Açıklama                                                                                                                          | Yanıt                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `POST /users/:id/block`   | Engelle. Gövde isteğe bağlı `{ "reason": string ≤500 }` (yalnız admin görür). 20/dk throttle, kullanıcı başına 1000 engel tavanı. | `{ success: true, message }`                                                                 |
| `DELETE /users/:id/block` | Engeli kaldır.                                                                                                                    | `{ success: true, message }`                                                                 |
| `GET /users/:id/block`    | Hedefi engelledim mi? (menüde Engelle / Engeli Kaldır)                                                                            | `{ blocked: boolean }`                                                                       |
| `GET /users/me/blocked`   | Engellediklerim.                                                                                                                  | `[{ id, username, displayName, companyName, avatarUrl, isVerified, sellerType, blockedAt }]` |
| `POST /user-reports`      | Şikayet: `{ type: product\|user\|collection\|message, targetId, reason, description? }`                                           | `ReportResponseDto`                                                                          |

Hata kodları: `400` kendini engelleme / zaten engelli / tavan (`server.user.*`),
`404` kullanıcı yok / engel yok.

## Engel varken istemcinin göreceği davranış

| Yüzey                                                                                                                              | Sonuç                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /messages/threads`, `POST /messages/threads/:id/messages`, `GET /messages/threads/:id`, `GET /messages/threads/:id/messages` | `403` `server.messaging.blocked` (derin link/polling de kapalı)                             |
| `GET /messages/threads`, `GET /messages/unread-count`                                                                              | Engelli kişilerin konuları listede/rozette yok (geçmiş silinmez; engel kalkınca geri gelir) |
| WebSocket `join:thread`, `typing:start`, `typing:stop`                                                                             | reddedilir / odadan çıkarılır                                                               |
| `POST /offers`, karşı teklifler, `POST /offers/:id/accept`                                                                         | `403` `server.offer.blocked`                                                                |
| `POST /trades`, `/trades/:id/accept`, `/trades/:id/counter`                                                                        | `403` `server.trade.blocked`                                                                |
| `POST /users/:id/follow`, `POST /collections/:id/like`                                                                             | `403` `server.user.interactionBlocked` (engelli taraf bildirim düşüremez)                   |
| `POST /cart/items`, direkt/sepet checkout                                                                                          | `403` `server.order.sellerBlocked` (misafir checkout kapsam dışı)                           |
| `GET /products`, `/products/popular`, `/products/:id/similar`, `/search/products`, `/search/autocomplete(-rich)`, wishlist         | Engelli satıcının ilanları yok                                                              |
| `GET /products/:id`                                                                                                                | `404`                                                                                       |
| `GET /users/:id/profile`, `GET /collections/:id`, `/collections/user/:id`                                                          | `404` (engellendiğini sızdırmaz)                                                            |
| `GET /collections/browse`, `/users/top-sellers`, `/users/top-collections`, `/users/search`, featured-*                             | Engelli kullanıcı/koleksiyon yok                                                            |

Engel anında iki yönlü takip silinir ve yeniden takip kapalıdır. Bekleyen
teklif/takas iptal edilmez; ancak engel sürdükçe kabul/karşı teklif de yapılamaz
(teklif bekler ve süresi dolar). Kapılar tek yerde: `UserBlockService.assertNotBlocked`
(403) ve `assertVisibleTo` (404); where filtreleri `excludeIds(hidden)` ile.

## Admin

- Her engelleme → `user_blocked_admin`, her şikayet → `user_reported_admin`
  in-app bildirimi (aktif tüm admin'lere). Gerekçe/tür/sebep cümleleri şablonda
  ICU `select` ile alıcının diline göre kurulur; çağıran ham enum/değer geçer.
- `GET /admin/users/:id` → `blocksGiven[]`, `blocksReceived[]`,
  `stats.blocksGivenCount/blocksReceivedCount`; panelde "Engellemeler" sekmesi.

## İstemci notu (mobil)

Engel/engel kaldırma sonrası tazelenecek query'ler: ürün listeleri/arama/öne
çıkanlar, mesaj konuları + okunmamış sayısı, satıcı profili/ürünleri/
koleksiyonları, koleksiyon keşfi, favoriler, takip durumu + takip listesi,
engellenenler listesi ve `GET /users/:id/block` durumu. Web referansı:
`apps/web/src/hooks/useBlockUser.ts` (`BLOCK_INVALIDATES`).
