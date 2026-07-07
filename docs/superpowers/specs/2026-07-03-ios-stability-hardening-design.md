# iOS Kararlılık Sertleştirme Paketi — Tasarım

Tarih: 2026-07-03
Kapsam: TestFlight'ta ortaya çıkan donma/takılma sınıflarını **kalıcı ve genel** fix'lerle gidermek. Kaynak: 3 paralel statik denetimin birleşik bulguları. Telefon doğrulama donması ve iki ufak sorun önceki turda çözüldü; bu spec kalan tüm bulguları kapsar.

## Üst kısıt (HER task için bağlayıcı)
**Hiçbir mevcut davranış bozulmayacak.** Her task:
- Yalnız hedef davranışı değiştirir; komşu mantığa dokunmaz.
- `apps/mobile`'da `npx tsc --noEmit` çıktısında değiştirdiği dosyalardan **yeni hata üretmez**.
- Ulaşılabilen ekran/akış için simülatörde duman testi yapılır (login gerektirmeyenler: splash, misafir, ana akış). Auth-gerektiren akışlar için değişiklik "davranış-koruyan" olduğu kod incelemesiyle gerekçelendirilir + TestFlight'a bırakılır.
- Subagent-driven review kapısından (spec uyumu + kalite) geçer.
- Değişiklikler küçük, izole ve tek sorumlulukludur (bir task ≈ bir bulgu/dosya grubu).

## Bulgu kaynağı (özet, denetimden)
Ortak kök neden (Bölüm 1): iOS'ta iki transparent `RNModal` üst üste gelince görünmez modal penceresi tüm dokunuşları yutar → donma. `appAlert` (@tarodan/ui-native AlertDialogHost) transparent RNModal; ui-native `Modal` de transparent RNModal. Bir `<Modal isOpen>` açıkken `appAlert` çağrılırsa donar. Telefon doğrulamada çözüldü; aynı sınıf 5 dosyada daha var.

---

## Bölüm 0 — Yeniden kullanılabilir primitive (`packages/ui-native`)

Amaç: modal-içi geri bildirim için tek, standart, düşük-riskli mekanizma. Modal render'ını (RNModal) DEĞİŞTİRMEZ — sadece içine konan bir mesaj bileşeni + yardımcılar.

- Yeni dosya `packages/ui-native/src/ModalMessage.tsx`:
  - `type ModalMessageState = { type: 'info' | 'error'; text: string } | null`
  - `useModalMessage()` → `{ state: ModalMessageState; info(text): void; error(text): void; clear(): void }` (içte `useState`).
  - `<ModalMessage state={state} />` → `state` null ise null döner; değilse temalı satır (error kırmızı, info muted), `testID="modal-message"`.
- Yeni yardımcı (aynı dosyada veya `alertAfterClose.ts`): `alertAfterClose(close: () => void, title: string, message?: string, delayMs = 400): void` → `close()` çağırır, `setTimeout(() => appAlert(title, message), delayMs)`. Terminal başarı bildirimlerinde modal kapanışı ile alert sunumunun iOS'ta çakışmasını önler.
- `packages/ui-native/src/index.ts`'e export ekle: `ModalMessage`, `useModalMessage`, `alertAfterClose`.
- Not: primitive Modal render'ını değiştirmediği için mevcut hiçbir modal görsel/davranışsal etkilenmez (geriye tam uyum).

## Bölüm 1 — Modal donması fix'leri (primitive ile)

Genel desen (telefon doğrulamada kanıtlandı): modal AÇIKKEN çağrılan `appAlert`'ler → `useModalMessage` satır mesajına. Terminal başarı (modalı kapatan) → `alertAfterClose(closeFn, ...)`. `<ModalMessage>` her modalın içine, aksiyon butonunun altına konur. Modal açılış/kapanışında `clear()`.

Dosyalar:
- `apps/mobile/app/settings/security.tsx` — kalan 4 modal handler'ı: `handlePasswordChange`, `handleVerifyTwoFactor`, `confirmDisableTwoFactor`, `handleRegenerateBackupCodes`. Her birinde: doğrulama/hata `appAlert` → ilgili modalın `useModalMessage`'ı; terminal başarı → `alertAfterClose`. (Telefon zaten bu deseni kullanıyor — tutarlılık.)
- `apps/mobile/src/components/ShareModal.tsx` — `handleCopyLink`/`handleWhatsAppShare`/`handleTelegramShare` catch'leri → satır mesajı.
- `apps/mobile/src/components/product/AddToCollectionModal.tsx` — `addToCollectionMutation.onError`, `createCollectionMutation.onError`, `handleCreateSubmit` doğrulaması → satır mesajı. (onSuccess zaten kapatıyor — dokunma.)
- `apps/mobile/src/components/product/MakeOfferModal.tsx` — `handleSubmit` doğrulama (L56/62/66) + catch (L78) → satır mesajı. (Başarı zaten `handleClose` — dokunma.)
- `apps/mobile/src/components/FeaturedListingsModal.tsx` — **özel**: `handleRemoveFeatured` bir ONAY diyaloğu (Kaldır/Vazgeç). Satır mesajı yetmez → modal-içi **satır-içi onay**: `pendingRemoveSlotId` state; çöp butonuna basınca modal içinde "Bu öne çıkarmayı kaldırmak istiyor musunuz? [Kaldır][Vazgeç]" gösterilir; [Kaldır] → `removeFeaturedMutation.mutate(slotId)` + onay temizle; mutation `onError` → `useModalMessage` satır mesajı. Hiç `appAlert` çağrılmaz.

## Bölüm 2 — Açılış donması (AnimatedSplash)

- `apps/mobile/src/components/AnimatedSplash.tsx` — `onFinish` yalnız fade `withTiming` callback'i `finished === true` ile çağrılıyor; kesilirse hiç çağrılmaz → splash kalıcı bloklar. Fix: (a) exit tetiklendiğinde `finished` ne olursa olsun `onFinish`'i **bir kez** çağır (idempotent guard'la); (b) ek güvenlik: bileşen mount olduğunda maksimum bir süre (örn. 6000ms) sonra `onFinish`'i zorlayan fallback timeout. Böylece animasyon/`appReady` ne olursa olsun splash mutlaka kapanır.
- `apps/mobile/app/_layout.tsx` — `loadToken()` hata yolunda `setAppReady(true)`'nun her durumda (finally) çağrıldığını doğrula/garanti et (zaten finally'de ise dokunma; değilse ekle). Davranış-koruyan.

## Bölüm 3 — Render'da yönlendirme

- `apps/mobile/app/membership/checkout.tsx` (~L123) — `if (!isAuthenticated) { router.replace(...); return null; }` render içinde. Fix: yönlendirmeyi `useEffect(() => { if (!isAuthenticated) router.replace('/(auth)/login'); }, [isAuthenticated])`'e taşı; render'da yalnız `if (!isAuthenticated) return null;`. (security.tsx'te uygulanan birebir desen.)

## Bölüm 4 — Takılı yükleme durumları

- `apps/mobile/src/components/product/BoostModal.tsx` — başarı yolunda (`onClose()` + `router.push()` + `return`) `submitting` sıfırlanmıyor. Fix: navigasyondan önce `setSubmitting(false)` (veya tüm handler'ı `try/finally`'ye alıp finally'de sıfırla). Davranış-koruyan; yalnız takılı state'i giderir.
- `apps/mobile/src/components/CardPaymentForm.tsx` — 3DS dalında (`threeDSHtml` set edip `return`) `processing` sıfırlanmıyor. Fix: 3DS WebView'e geçildiğinde `processing`'i uygun şekilde yönet (WebView açıkken buton zaten gizli/pasifse `processing`'i false yapıp WebView'i state ile göster; hedef: WebView kapanınca form takılı kalmasın).

## Bölüm 5 — İkinci dalga (MEDIUM/LOW)

- `apps/mobile/src/components/CardPaymentForm.tsx` — 3DS WebView, `/payment/success|fail` dışı terminal URL'de (banka hata sayfası) takılabilir; çıkış yok. Fix: WebView üstüne **"Vazgeç"/kapat** affordance'ı (kullanıcı 3DS'i iptal edip forma dönebilsin) + bilinen hata URL kalıplarında otomatik kap/geri.
- `apps/mobile/app/checkout/index.tsx` — OTP modal'ı hata sonrası açık takılıyor; kullanıcı net bir "Kapat" yoluyla çıkabilsin (modal onClose/İptal her hata durumunda çalışır olsun). Davranış-koruyan; sadece çıkış garantisi.
- Back-navigation guard'ları — şu deep-link ekranlarındaki `router.back()`'i `router.canGoBack() ? router.back() : router.replace('/(tabs)')` ile değiştir (kodda mevcut desen): `app/seller/[id].tsx`, `app/orders/[id].tsx`, `app/product/[id]/index.tsx`, `app/offers/[id].tsx`, `app/collections/[id]/index.tsx`, `app/collections/[id]/edit.tsx`, `app/messages/[threadId].tsx`. Yalnız hata/not-found ve ekran üst-back butonları; başka mantık değişmez.
- `apps/mobile/app/offers/index.tsx` (~L191-207) — batch komisyon tahmini catch'i `cancelled` guard'ı olmadan `setEstimatedNetByOfferId({})` ile önceki sonucu eziyor. Fix: catch'te `if (cancelled) return;` guard'ı (mevcut cleanup deseniyle tutarlı).

## Sıralama
Bölüm 0 → 1 → 2 → 3 → 4 (HIGH), sonra Bölüm 5 (MEDIUM/LOW). Bölüm 0 önce (primitive), Bölüm 1 ona dayanır.

## Kapsam dışı
- Modal host/portal mimari refactor'ü (yüksek regresyon riski; hibrit tercih edildi).
- Denetimde "temiz" çıkan alanlar (checkout/offer/listing/payment hata yönetimi, sonsuz effect döngüleri, kırık navigasyon linkleri — yok).
- İşlevsel yeni özellik yok; yalnız kararlılık/hata-yolu sertleştirmesi.

## Test yaklaşımı
- Birim testi: RN UI etkileşimleri için mevcut test altyapısı sınırlı; kritik saf-mantık varsa test yazılır, yoksa tsc + duman testi + kod incelemesi esas alınır.
- Duman testi (simülatör, login'siz): açılış (splash kapanıyor), misafir akışı, ana ekran navigasyonu.
- Auth-gerektiren modallar (security, teklif, koleksiyon): değişiklik davranış-koruyan olarak incelenir; nihai doğrulama TestFlight'ta.
- Her task subagent-driven review + Üst kısıt kontrolü.
