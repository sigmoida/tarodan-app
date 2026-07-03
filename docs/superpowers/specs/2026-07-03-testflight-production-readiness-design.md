# TestFlight Production-Hazırlık Paketi — Tasarım

Tarih: 2026-07-03
Kapsam: 4 paralel production-odaklı denetimin (env drift, iOS native/izin, cold-start/release, prod API/auth/PayTR) ortaya çıkardığı, **local'de görünmeyen ama TestFlight'ta çekirdek işlevi bozan** bug'ları kalıcı fix'lerle gidermek. Tüm bulgular kod okunarak teyit edildi.

## Üst kısıt (HER task için bağlayıcı)
**Hiçbir mevcut davranış bozulmayacak.** Her task: yalnız hedef davranışı değiştirir; `apps/mobile` tsc'de dokunulan dosyalardan yeni hata üretmez; ulaşılabilen akış simülatörde smoke edilir; subagent review kapısından geçer; küçük ve izole commit.

## Kararlar (brainstorm'da alındı)
- Committed `ios/` → **silinip prebuild'e bırakılacak** (app.json tek kaynak).
- Crash raporlama → **şimdilik ErrorBoundary yeter, Sentry sonraya** (DSN gerektirir).
- Hesap silme → **basit onaylı silme** (mevcut `deleteAccount()` API'sine bağlı).

---

## A. Auth token refresh sertleştirme (CRITICAL) — `apps/mobile/src/services/api.ts`

Kök neden (teyitli, `api.ts:123-145`): 401 interceptor'ı `POST /auth/refresh` yanıtından **yalnız `accessToken`'ı** kaydediyor. Backend her refresh'te refresh token'ı **rotasyona sokup eskisini iptal ediyor** (`auth.service.ts` assertAndRotateRefreshToken). Mobil eski (iptal) refreshToken'ı tuttuğu için ikinci yenileme döngüsünde refresh reddedilir → kullanıcı login'e atılır.

Fix:
1. Refresh yanıtından dönen **yeni `refreshToken`'ı da** SecureStore'a yaz: `const { accessToken, refreshToken: newRefresh } = response.data; await SecureStore.setItemAsync('accessToken', accessToken); if (newRefresh) await SecureStore.setItemAsync('refreshToken', newRefresh);`. (Backend response şekli `AuthResponseDto.tokens` mu yoksa düz mü — implementer `/auth/refresh` controller/response'unu doğrulayıp doğru path'i kullanacak; hem `response.data.tokens?.refreshToken` hem `response.data.refreshToken` toleranslı okunacak. accessToken için de aynı tolerans.)
2. **Tek-uçuş refresh mutex**: modül seviyesinde `let refreshPromise: Promise<string | null> | null`. İlk 401 refresh'i başlatır ve promise'i saklar; eşzamanlı 401'ler aynı promise'i `await` eder. Refresh bi/başarısız olunca promise sıfırlanır. Böylece paralel istekler tek refresh paylaşır (rotasyon çakışması + storm biter). Retry: her bekleyen istek yeni accessToken ile `api(originalRequest)` retry eder.
3. Refresh **başarısızsa** sadece token silip yönlendirme yerine mevcut merkezi çıkışı kullan: `useAuthStore.getState().logout()` çağır (SecureStore + Zustand + query cache + socket + push unregister temizlenir) — `authStore.logout()` bunu zaten yapıyor. (İçe aktarma döngüsü riskine dikkat: gerekiyorsa dinamik import ya da store getState.)

Test: `api.ts` saf fonksiyona ayrılabilen refresh mantığı için birim testi zorsa, kod-incelemesi + davranış-koruma esas; mutex ve rotated-token kaydı kod incelemesiyle doğrulanır.

## B. Committed `ios/` → prebuild (CRITICAL) — repo/config

Teyitli: `ios/` git'te tracked (23 dosya, standart Expo prebuild çıktısı; AppDelegate = default ExpoAppDelegate, özel native kod yok). EAS bundan build alıyor ve app.json config plugin'lerini yok sayıyor (önceki build log: "ios directory detected"). Committed Info.plist'te Google URL scheme YOK (0 eşleşme), entitlements'ta `aps-environment=development`.

Fix:
1. `git rm -r apps/mobile/ios` (git'ten kaldır; disk'ten de gider).
2. `apps/mobile/.gitignore`'a `/ios/` ekle (ve `/android/` zaten ignore değilse aynı mantıkla değerlendir — SADECE ios kapsamda; android'e dokunma).
3. **Doğrulama (build almadan):** `cd apps/mobile && npx expo prebuild --clean -p ios` çalıştır; üretilen `ios/Tarodan/Info.plist`'te `com.googleusercontent.apps.243308404313-...` URL scheme'inin ve `ios/Tarodan/Tarodan.entitlements`'ta `com.apple.developer.applesignin` (Apple capability açık olduğu için) geldiğini `grep` ile teyit et. aps-environment: prebuild lokal'de `development` üretir ama EAS store build'i production'a çevirir (managed credentials) — bu beklenen, dokunma.
4. Bu hamle otomatik çözer: Google scheme (H2), aps production (M1), kullanılmayan FaceID/mikrofon izin metinleri (app.json deklare etmiyor → prebuild eklemez, M3).

NOT: Bu değişiklikten sonra lokal `expo run:ios` de fresh prebuild yapar. Benim önceki manuel Info.plist/entitlements düzenlemelerim (uncommitted, stash'te) geçersiz kalır — sorun değil, app.json onları doğru üretecek.

## C. ErrorBoundary mount (HIGH) — `apps/mobile/app/_layout.tsx` (+ gerek/iyileştirme `src/components/ErrorBoundary.tsx`)

Teyitli: `ErrorBoundary` yazılmış ama hiçbir yerde mount edilmemiş → release'de render hatası = kalıcı beyaz ekran.

Fix:
1. `_layout.tsx`'te navigasyon kökünü (`<Stack>`'i saran en dış provider ağacını) `<ErrorBoundary>` ile sar.
2. `ErrorBoundary` fallback'i kullanıcı-dostu olmalı: "Bir şeyler ters gitti" + "Tekrar dene" butonu (state reset ile yeniden render). Mevcut fallback dev-only detay gösteriyorsa, prod'da sade kullanıcı mesajı + retry göster. componentDidCatch'te (Sentry kapalı olduğundan) en azından `console.error`/log kalsın (ileride Sentry bağlanınca oraya gider).

## D. Hesap silme UI (HIGH) — ayarlar ekranı + `deleteAccount()`

Teyitli: `userApi.deleteAccount()` (`DELETE /users/me`) + i18n metinleri var, UI yok → App Store Guideline 5.1.1(v) reddi.

Fix:
1. Ayarlar (uygun bir yer: `app/settings/security.tsx` ya da profil/ayar ekranı — mevcut yapıya en uygun olan) altına "Hesabı Sil" girişi ekle.
2. Basma → geri-alınamaz onay (bu bir EKRAN, modal-içi değil → `appAlert` confirm güvenli; ya da mevcut onay deseni) → onaylanınca `userApi.deleteAccount()` → başarıda `authStore.logout()` → `/(auth)/login`'e yönlendir. Hata → kullanıcıya mesaj.
3. i18n anahtarlarını kullan (tr.json:1021 "Hesabı Sil" vb.).

## E. Soğuk açılış push/deep-link routing (MEDIUM) — `apps/mobile/src/services/push.ts` + `_layout.tsx`

Teyitli: yalnız live `addNotificationResponseReceivedListener` var; `getLastNotificationResponseAsync`/`Linking.getInitialURL` yok → uygulama kapalıyken bildirime basınca deep-link kaybolur.

Fix: başlangıçta (router hazır olduktan sonra) `Notifications.getLastNotificationResponseAsync()` ile son cold-start bildirimini oku ve mevcut `routeFromNotification` ile yönlendir; bir kez çalışsın (idempotent guard). Aynı akışa `Linking.getInitialURL()` da eklenebilir (deep-link cold-start). Router-ready'den önce navigasyon yapma.

## F. Ödeme pre-3DS timeout güvenliği (MEDIUM) — `apps/mobile/src/components/CardPaymentForm.tsx`

Teyitli: `processDirect` (pre-3DS/Non3D) flaky bağlantıda 30sn client-timeout olabilir; sunucu ödemeyi işlese de `paymentId` set edilmediği için poll/verify devreye girmez → kullanıcı "başarısız" görür, sipariş pending kalır.

Fix: `processDirect` çağrısından elde bir `orderId`/`checkoutGroupId`/`paymentId` referansı VARSA (dosyayı okuyup mevcut değişkenleri doğrula), timeout/ağ hatasında sert "başarısız" yerine **verify/pending ekranına yönlendir** (mevcut `/payment/[id]` veya sipariş durumu ekranı) — kullanıcı olası charge sonrası durumu görebilsin. Timeout ile gerçek "kart reddedildi" hatasını ayır (axios `ECONNABORTED`/network vs API 4xx). 3DS yoluna DOKUNMA (zaten korunuyor).

## G. Görsel URL prod çözümü (MEDIUM) — `apps/mobile/src/utils/imageUrl.ts` + `webAssetUrl.ts`

Teyitli: standalone build'de `Constants.expoConfig?.hostUri` undefined → web-göreli yollar (`/photos/...`) `http://localhost:3000`'e çözülüp kırılıyor.

Fix: web asset host çözümünü şu önceliğe getir: `EXPO_PUBLIC_WEB_URL` (varsa) → production'da `https://tarodan.shop` (EXPO_PUBLIC_ENVIRONMENT !== 'development' ise) → yalnız dev'de `hostUri`/localhost. Böylece standalone'da doğru prod host kullanılır. (Bare S3-key MED-1 ayrıca: prod API tam URL döndürüyorsa sorun yok; imageUrl'de bare-key → placeholder davranışı korunur, sadece web-göreli localhost sızıntısı düzeltilir.)

## H. Küçük (LOW) — kod

1. `app/(auth)/login.tsx` Google/Apple handler'ları: `const { tokens, user } = response.data` yerine e-posta login'indeki toleranslı okuma desenini kullan (`data.tokens?.accessToken || data.accessToken`), token yoksa güvenli hata göster (SecureStore'a `undefined` yazıp throw etme). Kontrat sapmasında crash yerine düzgün hata.
2. `src/services/push.ts`: push-token POST gövdesindeki alan adını backend'in beklediği `deviceId` ile hizala (şu an `deviceName`).

## Kapsam dışı (bilinçli)
- **Sentry / crash telemetrisi** — DSN gerektirir; sonraya. ErrorBoundary (C) beyaz ekranı önler.
- **Connectivity/NetInfo offline UX** — yeni bağımlılık + feature; ayrı iş.
- **Hermes Intl fiyat/tarih** — kod değil; TestFlight build'inde cihazda **manuel doğrulama** notu (bozuksa ayrıca ele alınır).
- **eas.json submit placeholder'ları** — submit anında doldurulur.
- Denetimde "OK" çıkanlar (3DS WebView dayanıklı, payment success re-verify, Apple sign-in uyumu, PrivacyInfo, ATT yok) — dokunulmaz.

## Sıralama
A → B → C → D (CRITICAL/HIGH) → E → F → G → H (MEDIUM/LOW).

## Test/doğrulama
- Her task tsc temiz + izole commit + review kapısı.
- B: `expo prebuild --clean` + Info.plist/entitlements grep doğrulaması (build almadan).
- Ulaşılabilen akışlar (splash, misafir, ErrorBoundary fallback, account-delete onay ekranı) simülatörde smoke.
- Auth refresh (A) ve ödeme (F) gibi auth/prod-gerektiren akışlar davranış-koruma kod-incelemesiyle + nihai TestFlight doğrulamasıyla.
