# TestFlight Production-Hazırlık — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TestFlight/production'da çekirdek işlevi bozan (local'de görünmeyen) bug'ları kalıcı fix'lerle gidermek; hiçbir mevcut davranışı bozmadan.

**Architecture:** Auth refresh interceptor'ı rotated-token + tek-uçuş mutex ile sertleştirilir; committed `ios/` silinip prebuild'e bırakılır (app.json tek kaynak); ErrorBoundary mount edilir; hesap silme UI eklenir; cold-start push, ödeme timeout, görsel URL ve OAuth token okuma noktasal olarak düzeltilir.

**Tech Stack:** React Native / Expo, TypeScript, axios, expo-secure-store, expo-notifications, expo-router.

## Global Constraints (HER task için bağlayıcı)
- **Hiçbir mevcut davranış bozulmayacak** — yalnız hedef davranış değişir.
- Her task sonu: `cd apps/mobile && npx tsc --noEmit` → dokunulan dosyalardan **yeni hata YOK** (repo genelinde ~18 pre-existing hata var; sadece dokunduğun dosyalar temiz olmalı).
- Küçük, izole commit'ler. Başarı/happy-path mantığına dokunma; sadece belirtilen bug'ı düzelt.
- Prod API: `https://tarodan.shop/api`. Prod web: `https://tarodan.shop`. Bundle: `com.tarodan.app`. Google iOS reversed scheme: `com.googleusercontent.apps.243308404313-92c5475nff3874maoqes02ajakn81hvh`.

---

### Task 1: Auth token refresh sertleştirme (CRITICAL)

**Files:** Modify `apps/mobile/src/services/api.ts` (response interceptor ~103-148)

**Neden:** Refresh yanıtından yalnız `accessToken` kaydediliyor; backend refresh token'ı rotasyona sokup eskisini iptal ediyor → mobil eski token'ı tutunca ikinci yenilemede logout. Ayrıca refresh mutex yok (storm) ve başarısız refresh state'i temizlemiyor.

- [ ] **Step 1: Modül seviyesi mutex + refresh helper ekle**

`api.ts`'te response interceptor'dan ÖNCE (uygun bir yere) ekle:
```ts
// Tek-uçuş refresh: eşzamanlı 401'ler tek refresh paylaşır (rotated token + storm önlenir).
let refreshPromise: Promise<string | null> | null = null;

async function performTokenRefresh(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  if (!refreshToken) return null;
  const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
  const data: any = response.data;
  const newAccess: string | undefined = data?.tokens?.accessToken ?? data?.accessToken;
  const newRefresh: string | undefined = data?.tokens?.refreshToken ?? data?.refreshToken;
  if (!newAccess) return null;
  await SecureStore.setItemAsync('accessToken', newAccess);
  // ROTATED refresh token'ı da kaydet (asıl bug buydu).
  if (newRefresh) await SecureStore.setItemAsync('refreshToken', newRefresh);
  return newAccess;
}

async function handleAuthFailure(): Promise<void> {
  // Merkezi çıkış: SecureStore + Zustand + query cache + socket + push temizlenir.
  // require ile lazy import → api.ts ↔ authStore döngüsü (cycle) önlenir.
  try {
    const { useAuthStore } = require('../stores/authStore');
    await useAuthStore.getState().logout();
  } catch {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
  }
  router.replace('/(auth)/login');
}
```

- [ ] **Step 2: 401 bloğunu mutex + helper kullanacak şekilde değiştir**

Mevcut `if (error.response?.status === 401 && !originalRequest._retry) { ... }` bloğunu (SecureStore.getItemAsync('refreshToken') → axios.post → set accessToken → retry; catch → delete + router.replace) ŞUNUNLA değiştir:
```ts
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = performTokenRefresh().finally(() => { refreshPromise = null; });
        }
        const newAccess = await refreshPromise;
        if (newAccess) {
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return api(originalRequest);
        }
        await handleAuthFailure();
      } catch (refreshError) {
        await handleAuthFailure();
      }
    }
```
(USER_BANNED 403 bloğuna DOKUNMA; `return Promise.reject(error)` sonda kalır.)

- [ ] **Step 3: authStore.logout imzasını doğrula**

`Read apps/mobile/src/stores/authStore.ts` → `logout` gerçekten `() => Promise<void>` ve SecureStore+stores+socket temizliyor mu teyit et (audit'e göre evet). `useAuthStore.getState().logout()` çağrısının doğru olduğunu kontrol et.

- [ ] **Step 4: Derleme + döngü kontrolü**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -i "api.ts" && echo HATA || echo "api temiz"`
Expected: `api temiz`. (Cycle runtime sorunu tsc'de görünmez; lazy require kullanıldığı için güvenli.)

- [ ] **Step 5: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/src/services/api.ts
git commit -m "fix(mobile): auth refresh rotated token + tek-uçuş mutex + temiz logout (oturum düşmesi)"
```

---

### Task 2: Committed ios/ → prebuild (CRITICAL)

**Files:** Remove `apps/mobile/ios/**` (tracked), Modify `apps/mobile/.gitignore`

**Neden:** Committed ios/ bayat (Google URL scheme yok, aps-environment=development) ve EAS bundan build alıp app.json'u yok sayıyor. ios/ standart prebuild çıktısı (özel native kod yok) → güvenle silinip prebuild'e bırakılır.

- [ ] **Step 1: ios/'u git'ten kaldır ve gitignore'a ekle**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git rm -r apps/mobile/ios
```
`apps/mobile/.gitignore` dosyasına (yoksa oluştur) şu satırı ekle (zaten yoksa):
```
/ios/
```
(NOT: `/android/` mevcut durumu ne ise ona DOKUNMA — bu task yalnız ios kapsamında.)

- [ ] **Step 2: Prebuild ile app.json'dan yeniden üret (doğrulama)**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx expo prebuild --clean -p ios 2>&1 | tail -5`
Expected: prebuild başarılı, `ios/` yeniden oluşur (artık gitignore'da → tracked değil).

- [ ] **Step 3: Üretilen native config'i doğrula (asıl kanıt)**

```bash
cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile
echo "=== Google URL scheme geldi mi ==="; grep -c "googleusercontent.apps.243308404313-92c5475nff3874maoqes02ajakn81hvh" ios/Tarodan/Info.plist
echo "=== Apple sign-in entitlement geldi mi ==="; grep -c "applesignin" ios/Tarodan/Tarodan.entitlements
echo "=== FaceID/mikrofon (istenmeyen) app.json'dan gelmiyor ==="; grep -c "NSFaceIDUsageDescription\|NSMicrophoneUsageDescription" ios/Tarodan/Info.plist
```
Expected: Google scheme `1`, applesignin `1` (Apple capability açık olduğu için app.json usesAppleSignIn=true → entitlement gelir), FaceID/mikrofon `0`. Eğer applesignin gelmezse rapor et (app.json usesAppleSignIn kontrol edilir). aps-environment lokalde `development` kalır — EAS store build'i production yapar, bu beklenen (dokunma).

- [ ] **Step 4: git durumu — ios/ artık untracked olmalı**

Run: `cd /Users/gorkemsubas/dev/tarodan-app && git status --short apps/mobile/ios | head -3`
Expected: ios/ altındaki dosyalar için `??` YOK (gitignore'da) — yani `git status` ios/ dosyalarını göstermez. Sadece silinen tracked dosyalar staged olur.

- [ ] **Step 5: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/.gitignore
git add -A apps/mobile/ios 2>/dev/null; true
git commit -m "fix(mobile/ios): committed ios/ kaldır, prebuild'e bırak (Google scheme/aps/izin app.json'dan)"
```

---

### Task 3: ErrorBoundary'yi mount et (HIGH)

**Files:** Modify `apps/mobile/app/_layout.tsx`

**Neden:** `src/components/ErrorBoundary.tsx` yazılmış (i18n fallback + Tekrar Dene + captureException; i18n anahtarları mevcut) ama hiçbir yere mount edilmemiş → release'de render hatası = kalıcı beyaz ekran.

- [ ] **Step 1: Import ekle**

`apps/mobile/app/_layout.tsx` importlarına ekle:
```ts
import { ErrorBoundary } from '../src/components/ErrorBoundary';
```

- [ ] **Step 2: Provider ağacını ErrorBoundary ile sar**

`_layout.tsx`'in return'ünde (`<QueryClientProvider>...</QueryClientProvider>`) en dışı `<ErrorBoundary>` ile sar:
```tsx
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          {/* ...mevcut içerik aynen... */}
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
```
NOT: `ErrorBoundary`'nin fallback'i `useTranslation` kullanıyor; `LanguageProvider` ErrorBoundary'nin İÇİNDE. Bir render hatası LanguageProvider'ı da düşürürse fallback'te çeviri context'i olmayabilir — bu kabul edilebilir (fallback yine de render olur, `t()` anahtarı döner). Daha sağlamı istenirse ErrorBoundary'yi LanguageProvider'ın İÇİNE de koyabilirsin; ama en dışta olması "her şeyi yakalar" için tercih edilir. En dışta bırak.

- [ ] **Step 3: Derleme**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -i "_layout" && echo HATA || echo temiz`
Expected: `temiz`.

- [ ] **Step 4: Simülatör smoke — uygulama normal açılıyor mu**

Simülatörde uygulamayı yeniden başlat: normal açılıp ana ekrana geçmeli (ErrorBoundary sarması render'ı bozmamalı).

- [ ] **Step 5: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/app/_layout.tsx
git commit -m "fix(mobile): ErrorBoundary'yi kök ağaca mount et (release beyaz ekran koruması)"
```

---

### Task 4: Hesap silme UI (HIGH — App Store zorunlu)

**Files:** Modify `apps/mobile/app/(tabs)/profile.tsx` (logout butonu civarı ~712)

**Neden:** `userApi.deleteAccount()` (`DELETE /users/me`, api.ts:570) + i18n var, UI yok → Guideline 5.1.1(v) reddi.

- [ ] **Step 1: Dosyayı oku**

`Read apps/mobile/app/(tabs)/profile.tsx` — logout butonu (~712), `logout` kullanımı (~181), mevcut import'lar (`userApi` var mı, yoksa `authApi`/`api` üzerinden), `appAlert`/onay deseni, router.

- [ ] **Step 2: "Hesabı Sil" aksiyonu ekle**

Logout butonunun ALTINA, yıkıcı (destructive) bir "Hesabı Sil" bağlantısı/butonu ekle. Handler:
```tsx
const handleDeleteAccount = () => {
  appAlert(
    'Hesabı Sil',
    'Hesabınız ve tüm verileriniz kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?',
    [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Hesabı Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await userApi.deleteAccount();
            await logout();
            router.replace('/(auth)/login');
          } catch (e: any) {
            appAlert('Hata', e?.response?.data?.message || 'Hesap silinemedi. Lütfen tekrar deneyin.');
          }
        },
      },
    ],
  );
};
```
- Bu bir EKRAN (modal-içi değil) → `appAlert` confirm güvenli.
- `userApi` import edili değilse ekle (`import { userApi } from '../../src/services/api'` — gerçek path'i dosyadan doğrula). `appAlert` import edili değilse `@tarodan/ui-native`'den ekle.
- Buton görseli: küçük, yıkıcı renkli metin ("Hesabı Sil") — logout butonuyla tutarlı stil, mevcut `styles` kullan.

- [ ] **Step 3: Derleme + smoke**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -i "profile.tsx" && echo HATA || echo temiz`
Simülatörde (login'liysen) profil ekranında "Hesabı Sil" görünüyor + onay diyaloğu açılıyor mu bak (silmeyi ONAYLAMA — sadece diyaloğun çıktığını doğrula).

- [ ] **Step 4: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add "apps/mobile/app/(tabs)/profile.tsx"
git commit -m "feat(mobile): hesap silme (Hesabı Sil) — App Store 5.1.1(v) zorunluluğu"
```

---

### Task 5: Soğuk açılış push/deep-link routing (MEDIUM)

**Files:** Modify `apps/mobile/src/services/push.ts`

**Neden:** Yalnız live `addNotificationResponseReceivedListener` var; `getLastNotificationResponseAsync` yok → uygulama kapalıyken bildirime basınca deep-link kaybolur (ana ekrana düşer).

- [ ] **Step 1: Oku** — `setupPushNotificationRouting()` (~279) ve `routeFromNotification(data)` (~196). Notifications import'unu gör.

- [ ] **Step 2: setupPushNotificationRouting'e cold-start okuma ekle**

`setupPushNotificationRouting()` içinde, live listener kurulumunun yanına, bir kez çalışan cold-start okuması ekle:
```ts
  // Cold-start: uygulama KAPALIYKEN bildirime basılıp açıldıysa, yanıt live
  // listener'a düşmez → son yanıtı bir kez oku ve yönlendir.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) routeFromNotification(data);
    })
    .catch(() => { /* sessiz */ });
```
(Router hazır olduktan sonra çalışması için `routeFromNotification` zaten güvenli/try-catch'li — mevcut kodu koru. Eğer router-ready garantisi gerekiyorsa `routeFromNotification` içindeki mevcut hata yakalama yeterli.)

- [ ] **Step 3: Derleme**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -i "push.ts" && echo HATA || echo temiz`
Expected: `temiz`.

- [ ] **Step 4: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/src/services/push.ts
git commit -m "fix(mobile): cold-start bildirim tap'ini getLastNotificationResponse ile yönlendir"
```

---

### Task 6: Ödeme pre-3DS timeout güvenliği (MEDIUM)

**Files:** Modify `apps/mobile/src/components/CardPaymentForm.tsx`

**Neden:** `processDirect` (pre-3DS) flaky bağlantıda 30sn client-timeout olabilir; sunucu ödemeyi işlese de `paymentId` set edilmediği için verify/poll devreye girmez → kullanıcı "başarısız" görür, sipariş pending kalır.

- [ ] **Step 1: Oku** — `submit()` içindeki `paymentsApi.processDirect` çağrısı (~193), catch (~209), ve elde bir `orderId`/`checkoutGroupId`/`paymentId` referansı olup olmadığını doğrula. `success`/`fail` dallarını ve poll `useEffect`'ini (~86) incele.

- [ ] **Step 2: Timeout/ağ hatasını ayır ve verify'e yönlendir**

`submit()` catch'inde: hata bir **ağ/timeout** hatasıysa (`e?.code === 'ECONNABORTED'` veya `!e?.response` — sunucudan yanıt yok) ve elde bir ödeme referansı (orderId/paymentId) varsa, sert "başarısız" mesajı yerine **verify/pending akışına yönlendir** (mevcut `/payment/[id]` ekranına push, ya da "ödemeniz işleniyor, siparişlerinizden takip edin" bilgi mesajı + siparişlere yönlendir). Gerçek API 4xx (kart reddi) hatasında mevcut hata mesajı KALIR. Somut şablon (gerçek değişken adlarını dosyadan doğrula):
```tsx
} catch (e: any) {
  const isNetworkOrTimeout = e?.code === 'ECONNABORTED' || !e?.response;
  if (isNetworkOrTimeout && /* elde paymentId/orderId var */) {
    // Kullanıcı charge olmuş olabilir → sert fail gösterme, verify'e yönlendir.
    router.push({ pathname: '/payment/[id]', params: { id: String(paymentRef), /* mevcut paramlar */ } } as any);
    return;
  }
  setProcessing(false);
  // ...mevcut hata gösterimi (kart reddi vb.) aynen...
}
```
Eğer dosyada uygun bir ödeme referansı YOKSA (processDirect öncesi hiçbir id yoksa), minimum güvenli davranış: timeout'ta kullanıcıya "Ödemeniz işleniyor olabilir; siparişlerinizi kontrol edin" bilgi mesajı göster ve siparişler ekranına yönlendir — sert "başarısız" deme. İmplementer dosyadaki gerçekliğe göre en uygununu seçer ve raporunda açıklar.

- [ ] **Step 3: Derleme**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -i "CardPaymentForm" && echo HATA || echo temiz`
Expected: `temiz`.

- [ ] **Step 4: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/src/components/CardPaymentForm.tsx
git commit -m "fix(mobile): pre-3DS ödeme timeout'unda sert 'başarısız' yerine verify'e yönlendir"
```

---

### Task 7: Görsel URL prod host çözümü (MEDIUM)

**Files:** Modify `apps/mobile/src/utils/imageUrl.ts` (ve varsa `src/utils/webAssetUrl.ts`)

**Neden:** Standalone build'de `Constants.expoConfig?.hostUri` undefined → web-göreli yollar (`/photos/...`) `http://localhost:3000`'e çözülüp kırılıyor.

- [ ] **Step 1: `webAssetHost()`'u prod-farkında yap**

`apps/mobile/src/utils/imageUrl.ts` içindeki `webAssetHost()` fonksiyonunu değiştir:
```ts
function webAssetHost(): string {
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  if (webUrl) return webUrl.replace(/\/+$/, '');
  // Standalone/production: hostUri undefined → localhost DEĞİL, prod web host kullan.
  if (process.env.EXPO_PUBLIC_ENVIRONMENT && process.env.EXPO_PUBLIC_ENVIRONMENT !== 'development') {
    return 'https://tarodan.shop';
  }
  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (expoHost) return `http://${expoHost}:3000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}
```

- [ ] **Step 2: webAssetUrl.ts varsa aynı mantığı uygula**

`src/utils/webAssetUrl.ts` mevcutsa `getWebPublicAssetUrl` host çözümünü aynı önceliğe getir (EXPO_PUBLIC_WEB_URL → prod'da https://tarodan.shop → dev'de hostUri/localhost). Yoksa atla.

- [ ] **Step 3: Derleme**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -iE "imageUrl|webAssetUrl" && echo HATA || echo temiz`
Expected: `temiz`.

- [ ] **Step 4: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/src/utils/imageUrl.ts
git add apps/mobile/src/utils/webAssetUrl.ts 2>/dev/null; true
git commit -m "fix(mobile): web-göreli görselleri prod'da tarodan.shop'a çöz (localhost sızıntısı)"
```

---

### Task 8: OAuth token guard + push deviceId (LOW)

**Files:** Modify `apps/mobile/app/(auth)/login.tsx`, `apps/mobile/src/services/push.ts`

- [ ] **Step 1: login.tsx Google/Apple handler'larını toleranslı oku**

`app/(auth)/login.tsx`'te Google (`~147`) ve Apple (`~170`) handler'larındaki:
```tsx
const { tokens, user } = response.data as any;
await login(tokens.accessToken, user, tokens.refreshToken);
```
kısımlarını email-login'deki (satır 57-72) toleranslı desene çevir:
```tsx
const data = response.data as any;
const accessToken = data.tokens?.accessToken || data.accessToken;
const refreshToken = data.tokens?.refreshToken || data.refreshToken;
const user = data.user;
if (!accessToken) {
  appAlert('Hata', 'Giriş yanıtı beklenmedik biçimde geldi. Lütfen tekrar deneyin.');
  return;
}
await login(accessToken, user, refreshToken);
```
(Her iki handler için ayrı ayrı; `router.push('/' as never)` gibi mevcut sonraki adımlar korunur. `login(accessToken!,...)` non-null assertion kullanan yer varsa bu guard onu gereksiz kılar.)

- [ ] **Step 2: push-token gövde alanını `deviceId` yap**

`src/services/push.ts`'te push-token POST'larındaki (`~99` ve `~163`) `deviceName: Device.modelName` alanını backend'in beklediği `deviceId` ile hizala. Backend'in gerçekte hangi alanı beklediğini `notificationsApi.registerPushToken` (api.ts) tip imzasından doğrula; `deviceId` bekliyorsa `deviceId: Device.modelName ?? 'unknown'` gönder (veya daha kararlı bir cihaz kimliği varsa onu). İki POST'u da tutarlı yap.

- [ ] **Step 3: Derleme**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -iE "login.tsx|push.ts" && echo HATA || echo temiz`
Expected: `temiz`.

- [ ] **Step 4: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add "apps/mobile/app/(auth)/login.tsx" apps/mobile/src/services/push.ts
git commit -m "fix(mobile): OAuth token okuma guard'ı + push-token deviceId alanı"
```

---

## Self-Review
- **Spec coverage:** A→T1, B→T2, C→T3, D→T4, E→T5, F→T6, G→T7, H→T8. Kapsam dışı (Sentry/connectivity/Hermes/submit-placeholder) plana alınmadı (spec'te bilinçli). ✓
- **Placeholder taraması:** T1/T3/T7/T8 tam kodlu; T2 tam komut; T4/T5/T6 read+apply ama somut kod şablonu + doğrulanacak değişkenler açıkça belirtildi (mekanik değil, bağlam-gerektiren yerler). TBD yok. ✓
- **Tip tutarlılığı:** `performTokenRefresh(): Promise<string|null>`, `handleAuthFailure(): Promise<void>`, `refreshPromise` T1 içinde tutarlı. `webAssetHost()` T7. `deleteAccount()` mevcut API. ✓
- **"Bozma" güvencesi:** her task izole + tsc + review kapısı; happy-path/başarı yollarına dokunulmuyor; T2 doğrulaması build almadan grep ile. ✓
