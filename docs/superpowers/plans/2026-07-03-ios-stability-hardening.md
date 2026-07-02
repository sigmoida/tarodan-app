# iOS Kararlılık Sertleştirme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TestFlight'ta görülen donma/takılma sınıflarını kalıcı ve genel fix'lerle gidermek; hiçbir mevcut davranışı bozmadan.

**Architecture:** Sistemik modal-donması sınıfı için ui-native'e küçük bir yeniden-kullanılabilir primitive (`ModalMessage`/`useModalMessage`/`alertAfterClose`) eklenir ve 5 modal dosyasına uygulanır (Modal render'ı DEĞİŞMEZ). Diğer bulgular (splash, render-nav, takılı buton, 3DS/OTP/back) noktasal, davranış-koruyan fix'lerle giderilir.

**Tech Stack:** React Native / Expo, TypeScript, @tarodan/ui-native, expo-router, react-native-reanimated.

## Global Constraints (HER task için bağlayıcı)
- **Hiçbir mevcut davranış bozulmayacak.** Yalnız hedef davranış değişir; komşu mantığa dokunulmaz.
- Her task sonunda `cd apps/mobile && npx tsc --noEmit` → değiştirilen dosyalardan **yeni hata YOK**. (Not: repo genelinde alakasız pre-existing hatalar olabilir; sadece dokunduğun dosyalar temiz olmalı.)
- Modal donması fix deseni: modal AÇIKKEN çağrılan `appAlert` → `useModalMessage` satır mesajı; modalı kapatan terminal başarı → `alertAfterClose(closeFn, ...)`. `onSuccess`/başarı yolları zaten modalı kapatıyorsa yalnız gerekli yeri değiştir, gerisine dokunma.
- Referans (zaten uygulanmış, kanıtlı): `apps/mobile/app/settings/security.tsx` telefon doğrulama akışı (`phoneMsg` inline mesaj + `setTimeout(appAlert, 400)`).
- Küçük, izole commit'ler. Bir task = bir bulgu/dosya grubu.

---

## File Structure
- `packages/ui-native/src/ModalMessage.tsx` — yeni primitive (Task 1).
- `packages/ui-native/src/index.ts` — export (Task 1).
- `apps/mobile/app/settings/security.tsx` — 4 modal handler (Task 2).
- `apps/mobile/src/components/product/MakeOfferModal.tsx` (Task 3).
- `apps/mobile/src/components/product/AddToCollectionModal.tsx` (Task 4).
- `apps/mobile/src/components/ShareModal.tsx` (Task 5).
- `apps/mobile/src/components/FeaturedListingsModal.tsx` — satır-içi onay (Task 6).
- `apps/mobile/src/components/AnimatedSplash.tsx` — açılış donması (Task 7).
- `apps/mobile/app/membership/checkout.tsx` — render-nav (Task 8).
- `apps/mobile/src/components/product/BoostModal.tsx` + `apps/mobile/src/components/CardPaymentForm.tsx` — takılı buton (Task 9).
- `apps/mobile/src/components/CardPaymentForm.tsx` + `apps/mobile/app/checkout/index.tsx` + 7 deep-link ekranı — ikinci dalga (Task 10).

---

### Task 1: ui-native primitive — ModalMessage / useModalMessage / alertAfterClose

**Files:**
- Create: `packages/ui-native/src/ModalMessage.tsx`
- Modify: `packages/ui-native/src/index.ts`

**Interfaces (Produces):**
- `type ModalMessageState = { type: 'info' | 'error'; text: string } | null`
- `useModalMessage(): { state: ModalMessageState; info(text: string): void; error(text: string): void; clear(): void }`
- `<ModalMessage state={ModalMessageState} />` (testID `modal-message`)
- `alertAfterClose(close: () => void, title: string, message?: string, delayMs?: number): void`

- [ ] **Step 1: Primitive dosyasını oluştur**

Create `packages/ui-native/src/ModalMessage.tsx`:
```tsx
import { useCallback, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { theme } from './theme';
import { appAlert } from './AlertDialog';

const { colors, spacing, typography } = theme;

export type ModalMessageState = { type: 'info' | 'error'; text: string } | null;

/** Modal-içi bilgi/hata mesajı state'i. appAlert'i (transparent RNModal) bir
 *  Modal açıkken çağırmak iOS'ta donma yapıyordu; bunun yerine modal içinde
 *  satır mesajı gösteriyoruz. */
export function useModalMessage() {
  const [state, setState] = useState<ModalMessageState>(null);
  const info = useCallback((text: string) => setState({ type: 'info', text }), []);
  const error = useCallback((text: string) => setState({ type: 'error', text }), []);
  const clear = useCallback(() => setState(null), []);
  return { state, info, error, clear };
}

/** Modal içine konan satır mesajı. state null ise hiçbir şey render etmez. */
export function ModalMessage({ state }: { state: ModalMessageState }) {
  if (!state) return null;
  return (
    <Text
      testID="modal-message"
      style={[styles.base, state.type === 'error' ? styles.error : styles.info]}
    >
      {state.text}
    </Text>
  );
}

/** Terminal başarı bildirimi: önce modalı kapat, sonra (modal tamamen kapandıktan
 *  sonra) appAlert göster. Aynı tick'te kapat+aç iOS'ta modal sunum çakışması
 *  yapıyordu. */
export function alertAfterClose(
  close: () => void,
  title: string,
  message?: string,
  delayMs = 400,
): void {
  close();
  setTimeout(() => appAlert(title, message), delayMs);
}

const styles = StyleSheet.create({
  base: {
    marginTop: spacing[3],
    textAlign: 'center',
    fontSize: typography.fontSize.sm,
  },
  error: { color: colors.danger[600]! },
  info: { color: colors.text.muted },
});
```

- [ ] **Step 2: index.ts'e export ekle**

`packages/ui-native/src/index.ts` içinde, `AlertDialog` export bloğunun (`appAlert, AlertDialogHost, ...`) hemen altına ekle:
```ts
export {
  ModalMessage,
  useModalMessage,
  alertAfterClose,
  type ModalMessageState,
} from './ModalMessage';
```

- [ ] **Step 3: Derleme + import doğrulaması**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -iE "ModalMessage" && echo HATA || echo "ModalMessage temiz"`
Expected: `ModalMessage temiz`. (Not: `theme.colors.danger[600]`, `theme.colors.text.muted`, `theme.spacing[3]`, `theme.typography.fontSize.sm` mevcut — AlertDialog.tsx ve Modal.tsx bunları kullanıyor.)

- [ ] **Step 4: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add packages/ui-native/src/ModalMessage.tsx packages/ui-native/src/index.ts
git commit -m "feat(ui-native): ModalMessage/useModalMessage/alertAfterClose primitive (modal-içi geri bildirim)"
```

---

### Task 2: security.tsx — kalan 4 modalın appAlert'lerini modal-içi mesaja çevir

**Files:** Modify `apps/mobile/app/settings/security.tsx`

**Interfaces (Consumes):** Task 1 primitive.

Bu dosyada telefon doğrulama zaten `phoneMsg` inline deseniyle düzeltildi. Aynısını diğer 4 modala uygula. Her modal için AYRI bir `useModalMessage` örneği kullan (mesajlar karışmasın).

- [ ] **Step 1: Import + 4 mesaj örneği**

`apps/mobile/app/settings/security.tsx` içinde ui-native import'una `useModalMessage`, `ModalMessage`, `alertAfterClose` ekle (mevcut `appAlert` import'unun yanına). `phoneMsg` state'inin tanımlandığı yerin yakınına 4 örnek ekle:
```ts
  const pwMsg = useModalMessage();
  const twoFaMsg = useModalMessage();
  const disableMsg = useModalMessage();
  const regenMsg = useModalMessage();
```

- [ ] **Step 2: `handlePasswordChange`'i dönüştür**

Bu handler'da (`showPasswordDialog` modalı) şu dönüşümleri yap:
- Baştaki `pwMsg.clear();` (setLoading(true) civarı).
- `if (newPassword !== confirmPassword) { appAlert('Hata', 'Şifreler eşleşmiyor'); return; }` → `appAlert(...)` yerine `pwMsg.error('Şifreler eşleşmiyor');` (return kalır).
- Diğer senkron doğrulama `appAlert('Hata', ...)` çağrıları → `pwMsg.error(<aynı metin>)`.
- Başarı yolu: mevcut `appAlert('Başarılı', 'Şifreniz değiştirildi'); setShowPasswordDialog(false);` → `alertAfterClose(() => setShowPasswordDialog(false), 'Başarılı', 'Şifreniz değiştirildi');` (sıra düzelir: önce kapat, sonra alert).
- Catch'teki `appAlert('Hata', error.response?.data?.message || 'Şifre değiştirilemedi')` → `pwMsg.error(error.response?.data?.message || 'Şifre değiştirilemedi')`.

- [ ] **Step 3: `handleVerifyTwoFactor`'i dönüştür** (`showTwoFactorSetup` modalı, `twoFaMsg`)
- Baş: `twoFaMsg.clear();`
- `appAlert('Hata', 'Lütfen 6 haneli doğrulama kodunu girin')` → `twoFaMsg.error('Lütfen 6 haneli doğrulama kodunu girin')`.
- Başarı: `setShowTwoFactorSetup(false); appAlert('Başarılı', 'İki faktörlü doğrulama aktifleştirildi');` → `alertAfterClose(() => setShowTwoFactorSetup(false), 'Başarılı', 'İki faktörlü doğrulama aktifleştirildi');` (varsa aradaki diğer state güncellemelerini KORU, sadece kapat+alert kısmını değiştir).
- Catch `appAlert('Hata', ...)` → `twoFaMsg.error(...)`.

- [ ] **Step 4: `confirmDisableTwoFactor`'i dönüştür** (`showDisableDialog`, `disableMsg`)
- Baş: `disableMsg.clear();`
- Doğrulama `appAlert('Hata', 'Lütfen 6 haneli doğrulama kodunu girin')` → `disableMsg.error(...)`.
- Başarı: `setShowDisableDialog(false); appAlert('Başarılı', 'İki faktörlü doğrulama kapatıldı');` → `alertAfterClose(() => setShowDisableDialog(false), 'Başarılı', 'İki faktörlü doğrulama kapatıldı');`.
- Catch → `disableMsg.error(...)`.

- [ ] **Step 5: `handleRegenerateBackupCodes`'i dönüştür** (`showRegenerateDialog`, `regenMsg`)
- Baş: `regenMsg.clear();`
- Doğrulama `appAlert('Hata', 'Lütfen 6 haneli doğrulama kodunu girin')` → `regenMsg.error(...)`.
- Catch `appAlert('Hata', error.response?.data?.message || 'Yedek kodlar yenilenemedi')` → `regenMsg.error(...)`. (Başarı yolu modalı kapatmıyor, inline `newBackupCodes` gösteriyor — DOKUNMA.)

- [ ] **Step 6: Her modalın içine `<ModalMessage>` render et**

Password/2FA-setup/disable/regenerate `<Modal ...>` bloklarının içine, aksiyon butonlarının altına ilgili mesajı ekle:
- password modalı: `<ModalMessage state={pwMsg.state} />`
- 2FA setup modalı: `<ModalMessage state={twoFaMsg.state} />`
- disable modalı: `<ModalMessage state={disableMsg.state} />`
- regenerate modalı: `<ModalMessage state={regenMsg.state} />`

Ayrıca her modalın açılış tetikleyicisinde (butona basınca `setShowXDialog(true)`) ve `onClose`'unda ilgili `msg.clear()` çağır (telefon modalındaki desenle tutarlı).

- [ ] **Step 7: Derleme + hiçbir appAlert modal-açıkken kalmadı doğrulaması**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -i "security.tsx" && echo HATA || echo "security temiz"`
Expected: `security temiz`.
Run: `grep -n "appAlert" app/settings/security.tsx`
Expected: yalnız `handleSetupTwoFactor`'daki `appAlert('Hata', ...)` KALIR (o çağrıldığında setup modalı henüz AÇIK DEĞİL — güvenli; denetimde SAFE işaretlendi). Password/2FA-verify/disable/regenerate handler'larında appAlert kalmamalı.

- [ ] **Step 8: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/app/settings/security.tsx
git commit -m "fix(mobile/ios): security modallarında appAlert donmasını modal-içi mesajla gider (şifre/2FA/yedek kod)"
```

---

### Task 3: MakeOfferModal — modal-içi mesaj

**Files:** Modify `apps/mobile/src/components/product/MakeOfferModal.tsx`

**Interfaces (Consumes):** Task 1 primitive.

Bu bileşen bir ui-native `<Modal isOpen={visible}>` render eder. `handleSubmit` içinde modal açıkken `appAlert` çağrılıyor (doğrulama L~56/62/66 + catch L~78). Başarı yolu zaten `handleClose()` çağırıyor — DOKUNMA.

- [ ] **Step 1: Dosyayı oku, mevcut yapıyı gör**

`Read apps/mobile/src/components/product/MakeOfferModal.tsx`. `handleSubmit`, `handleClose`, `<Modal>` render'ı ve mevcut ui-native import'unu incele.

- [ ] **Step 2: primitive'i ekle ve dönüştür**
- ui-native import'una `useModalMessage, ModalMessage` ekle.
- Bileşen içinde `const msg = useModalMessage();`.
- `handleSubmit` başında `msg.clear();`.
- `handleSubmit` içindeki TÜM `appAlert('...', '...')` çağrılarını (doğrulama: 'Geçersiz Tutar', 'Düşük Tutar', 'Yüksek Tutar'; catch: 'Hata') `msg.error(<appAlert'in ikinci argümanı = mesaj metni>)` ile değiştir. (Başlık + mesaj iki argümanlıysa, kullanıcıya gösterilecek metni birleştir: `msg.error(\`${başlık}: ${mesaj}\`)` yerine sade tut — sadece açıklama metnini göster, örn. 'Pozitif bir teklif tutarı girin.'.)
- `<Modal>` içine, submit butonunun altına `<ModalMessage state={msg.state} />` ekle.
- `handleClose` içinde (veya modal her açıldığında) `msg.clear();`.

Örnek dönüşüm (birebir uygula):
```tsx
// ÖNCE:
if (!numeric || numeric <= 0) { appAlert('Geçersiz Tutar', 'Pozitif bir teklif tutarı girin.'); return; }
// SONRA:
if (!numeric || numeric <= 0) { msg.error('Pozitif bir teklif tutarı girin.'); return; }
```
```tsx
// catch ÖNCE: appAlert('Hata', e?.response?.data?.message || 'Teklif gönderilemedi. Lütfen tekrar deneyin.');
// SONRA:      msg.error(e?.response?.data?.message || 'Teklif gönderilemedi. Lütfen tekrar deneyin.');
```

- [ ] **Step 3: Derleme + appAlert temiz**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -i "MakeOfferModal" && echo HATA || echo temiz`
Run: `grep -n "appAlert" src/components/product/MakeOfferModal.tsx` → beklenen: 0 (import da kaldırılabilir).
Expected: `temiz`, appAlert yok.

- [ ] **Step 4: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/src/components/product/MakeOfferModal.tsx
git commit -m "fix(mobile/ios): MakeOfferModal appAlert donmasını modal-içi mesajla gider"
```

---

### Task 4: AddToCollectionModal — modal-içi mesaj

**Files:** Modify `apps/mobile/src/components/product/AddToCollectionModal.tsx`

**Interfaces (Consumes):** Task 1 primitive. Aynı desen (Task 3 ile birebir yaklaşım).

- [ ] **Step 1: Oku** — `Read apps/mobile/src/components/product/AddToCollectionModal.tsx`. `addToCollectionMutation.onError`, `createCollectionMutation.onError`, `handleCreateSubmit` doğrulaması, `<Modal>` render'ı.

- [ ] **Step 2: Dönüştür**
- ui-native import'una `useModalMessage, ModalMessage` ekle; `const msg = useModalMessage();`.
- `addToCollectionMutation.onError` → `msg.error(e?.response?.data?.message || 'Ürün koleksiyona eklenemedi.')`.
- `createCollectionMutation.onError` → `msg.error(<mevcut metin>)`.
- `handleCreateSubmit` başında `msg.clear()`; validation `appAlert('Eksik', 'Koleksiyon adı girin.')` → `msg.error('Koleksiyon adı girin.')`.
- `<Modal>` içine `<ModalMessage state={msg.state} />`.
- Modal açılış/kapanışta `msg.clear()`.
- **DOKUNMA:** `onSuccess` yolları (`onDismiss()`/`handleClose()`) zaten güvenli.

- [ ] **Step 3: Doğrula** — `npx tsc --noEmit | grep AddToCollectionModal` temiz; `grep appAlert` → 0.
- [ ] **Step 4: Commit** — `git commit -m "fix(mobile/ios): AddToCollectionModal appAlert donmasını modal-içi mesajla gider"`

---

### Task 5: ShareModal — modal-içi mesaj

**Files:** Modify `apps/mobile/src/components/ShareModal.tsx`

**Interfaces (Consumes):** Task 1 primitive.

- [ ] **Step 1: Oku** — `handleCopyLink`, `handleWhatsAppShare`, `handleTelegramShare` catch'leri (`appAlert('Hata', ...)`), `<Modal>` render'ı.
- [ ] **Step 2: Dönüştür**
- `useModalMessage, ModalMessage` import; `const msg = useModalMessage();`.
- Üç catch'teki `appAlert('Hata', 'Link kopyalanamadı')` / `'WhatsApp açılamadı'` / `'Telegram açılamadı'` → `msg.error(<aynı metin>)`.
- Başarılı kopyalama zaten Snackbar/inline gösteriyorsa dokunma; yalnız hata `appAlert`'lerini çevir.
- `<Modal>` içine `<ModalMessage state={msg.state} />`; paylaşım tetiklenince/modal açılınca `msg.clear()`.
- [ ] **Step 3: Doğrula** — `npx tsc --noEmit | grep ShareModal` temiz; `grep appAlert` → 0.
- [ ] **Step 4: Commit** — `git commit -m "fix(mobile/ios): ShareModal appAlert donmasını modal-içi mesajla gider"`

---

### Task 6: FeaturedListingsModal — satır-içi onay (appAlert confirm yerine)

**Files:** Modify `apps/mobile/src/components/FeaturedListingsModal.tsx`

**Interfaces (Consumes):** Task 1 primitive (`useModalMessage`/`ModalMessage` hata için).

Buradaki `appAlert` bir ONAY diyaloğu (`handleRemoveFeatured`: "Kaldır"/İptal). Satır mesajı yetmez → modal-içi satır-içi onay.

- [ ] **Step 1: Oku** — `handleRemoveFeatured` (L~136-145), çöp `IconButton` (L~228), `removeFeaturedMutation`, `<Modal>` render'ı, mevcut Snackbar kullanımı.

- [ ] **Step 2: Satır-içi onay state'i ekle**
- `const [pendingRemove, setPendingRemove] = useState<{ slotId: string; title: string } | null>(null);`
- `const msg = useModalMessage();` (mutation hataları için) + import.

- [ ] **Step 3: `handleRemoveFeatured`'i onay-state kurmaya çevir**
```tsx
// ÖNCE: appAlert('Öne Çıkarmayı Kaldır', ..., { text: 'Kaldır', style: 'destructive', onPress: () => removeFeaturedMutation.mutate(slotId) }, ...)
// SONRA:
const handleRemoveFeatured = (slotId: string, productTitle: string) => {
  setPendingRemove({ slotId, title: productTitle });
};
```

- [ ] **Step 4: Modal içinde satır-içi onay bloğu render et**

`<Modal>` içinde, `pendingRemove` varsa liste üstünde/altında bir onay satırı göster:
```tsx
{pendingRemove && (
  <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.danger[50]! }}>
    <Text>{`"${pendingRemove.title}" öne çıkarmasını kaldırmak istiyor musunuz?`}</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button
        variant="danger"
        title="Kaldır"
        isLoading={removeFeaturedMutation.isPending}
        onPress={() => { const id = pendingRemove.slotId; setPendingRemove(null); removeFeaturedMutation.mutate(id); }}
      />
      <Button variant="ghost" title="Vazgeç" onPress={() => setPendingRemove(null)} />
    </View>
  </View>
)}
<ModalMessage state={msg.state} />
```
(Var olan `Button`/`View`/`Text`/`colors` importlarını kullan; yoksa ekle. `colors.danger[50]` yoksa mevcut bir uyarı arka planı token'ı kullan.)

- [ ] **Step 5: mutation `onError` → `msg.error(...)`**

`removeFeaturedMutation`'ın `onError`'ı varsa (yoksa ekle) `appAlert` yerine `msg.error(e?.response?.data?.message || 'Öne çıkarma kaldırılamadı.')`.

- [ ] **Step 6: Doğrula** — `npx tsc --noEmit | grep FeaturedListingsModal` temiz; `grep appAlert` → 0.
- [ ] **Step 7: Commit** — `git commit -m "fix(mobile/ios): FeaturedListingsModal onay diyaloğunu satır-içi onaya çevir (appAlert donması)"`

---

### Task 7: AnimatedSplash — açılışta kalıcı bloklamayı gider

**Files:** Modify `apps/mobile/src/components/AnimatedSplash.tsx`

Sorun: çıkış efektinde `rootOpacity` `withTiming` callback'i yalnız `finished === true` iken `onFinish` çağırıyor; animasyon kesilirse (veya `appReady` hiç gelmezse) splash `absoluteFill` overlay'i tüm dokunuşları kalıcı bloklar. `_layout.tsx` `appReady`'yi `finally`'de set ediyor (o taraf güvenli), sorun bu bileşende.

- [ ] **Step 1: Idempotent finish guard'ı ekle**

`exiting`/`splashHidden` ref'lerinin yanına ekle:
```ts
  const finished = useRef(false);
```
Ve bir yardımcı:
```ts
  const finishOnce = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  }, [onFinish]);
```
(`useCallback`'i react import'una ekle.)

- [ ] **Step 2: Çıkış efektinde finished:false olsa bile bitir**

`rootOpacity.value = withTiming(0, {...}, (finished) => { if (finished) runOnJS(onFinish)(); })` bloğunu şununla değiştir:
```ts
    rootOpacity.value = withTiming(
      0,
      { duration: 350, easing: Easing.in(Easing.cubic) },
      () => {
        runOnJS(finishOnce)();
      },
    );
```
(`finished` parametresine bakmadan HER durumda `finishOnce` — animasyon kesilse bile overlay kaldırılır. `finishOnce` idempotent olduğu için çift çağrı zararsız.)

Ayrıca bu effect'in bağımlılık dizisindeki `onFinish`'i `finishOnce` ile değiştir.

- [ ] **Step 3: Güvenlik fallback timeout'u ekle (mount'ta bir kez)**

Yeni bir effect ekle (giriş animasyonu effect'inin yakınına):
```ts
  // Güvenlik ağı: appReady/animasyon ne olursa olsun splash en geç bu süre sonra kapanır.
  useEffect(() => {
    const t = setTimeout(() => {
      rootOpacity.value = 0;
      finishOnce();
    }, 8000);
    return () => clearTimeout(t);
  }, [rootOpacity, finishOnce]);
```
(8sn: MIN_VISIBLE_MS + normal token yüklemesinin çok üstünde; sadece patoloji durumunda devreye girer.)

- [ ] **Step 4: Derleme + duman testi (simülatör, login gerektirmez)**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -i "AnimatedSplash" && echo HATA || echo temiz`
Simülatörde uygulamayı yeniden başlat (Metro bağlıysa reload): splash normal açılıp **kapanmalı**, uygulama ana ekrana geçmeli (mevcut davranış korunur; regresyon yok).

- [ ] **Step 5: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/src/components/AnimatedSplash.tsx
git commit -m "fix(mobile/ios): AnimatedSplash çıkışını idempotent + fallback timeout ile garanti et (açılış donması)"
```

---

### Task 8: membership/checkout.tsx — render'da yönlendirmeyi effect'e taşı

**Files:** Modify `apps/mobile/app/membership/checkout.tsx`

`useEffect` zaten import edili (satır 1). security.tsx'te uygulanan birebir desen.

- [ ] **Step 1: Auth guard'ı değiştir**

`apps/mobile/app/membership/checkout.tsx` içinde (~L123):
```tsx
// ÖNCE:
  if (!isAuthenticated) {
    router.replace('/(auth)/login');
    return null;
  }
// SONRA:
  useEffect(() => {
    if (!isAuthenticated) router.replace('/(auth)/login');
  }, [isAuthenticated]);
  if (!isAuthenticated) return null;
```
Bu `useEffect`'i diğer tüm hook'lardan SONRA, ilk erken-return'den ÖNCE konumlandır (mevcut guard zaten oradaydı; sadece içeriğini değiştiriyoruz — hook sırası korunur).

- [ ] **Step 2: Derleme + doğrula**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -i "membership/checkout" && echo HATA || echo temiz`
Run: `grep -n "router.replace('/(auth)/login')" app/membership/checkout.tsx` → artık useEffect içinde olmalı.

- [ ] **Step 3: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/app/membership/checkout.tsx
git commit -m "fix(mobile): membership/checkout render sırasında yönlendirmeyi effect'e taşı"
```

---

### Task 9: Takılı yükleme durumları — BoostModal + CardPaymentForm

**Files:** Modify `apps/mobile/src/components/product/BoostModal.tsx`, `apps/mobile/src/components/CardPaymentForm.tsx`

- [ ] **Step 1: BoostModal — başarı yolunda submitting sıfırla**

`apps/mobile/src/components/product/BoostModal.tsx` `handleConfirm` içinde, başarı bloğunu değiştir:
```tsx
// ÖNCE:
      if (paymentId) {
        onClose();
        router.push({ ... } as any);
        return;
      }
// SONRA:
      if (paymentId) {
        setSubmitting(false);
        onClose();
        router.push({ ... } as any);
        return;
      }
```
(Sadece `setSubmitting(false);` navigasyondan ÖNCE eklenir — buton sonsuza dek `submitting=true` kalmaz. `router.push` params'ı OLDUĞU GİBİ korunur.)

- [ ] **Step 2: CardPaymentForm — 3DS dalında processing takılmasını gider**

`Read apps/mobile/src/components/CardPaymentForm.tsx` — `submit()` (L~158-212) ve `threeDSHtml` set edip `return` eden 3DS dalını (L~197-199) incele. 3DS'e geçildiğinde `processing` true kalıyor. Fix: 3DS WebView state'i set edildikten sonra `setProcessing(false)` çağır (WebView artık ekranı kontrol ediyor; form butonu takılı kalmasın). Somut:
```tsx
// 3DS dalı ÖNCE (yaklaşık):
      setThreeDSHtml(html);
      return;
// SONRA:
      setThreeDSHtml(html);
      setProcessing(false);
      return;
```
(Gerçek değişken adları dosyadan doğrulanır: `threeDSHtml`/`setThreeDSHtml`, `processing`/`setProcessing`. Success/fail dalları ve catch'e DOKUNMA.)

- [ ] **Step 3: Derleme**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -iE "BoostModal|CardPaymentForm" && echo HATA || echo temiz`
Expected: `temiz`.

- [ ] **Step 4: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/src/components/product/BoostModal.tsx apps/mobile/src/components/CardPaymentForm.tsx
git commit -m "fix(mobile/ios): takılı 'yükleniyor' durumlarını gider (BoostModal başarı, CardPaymentForm 3DS)"
```

---

### Task 10: İkinci dalga — 3DS/OTP çıkış affordance + back-guard'ları

**Files:** Modify `apps/mobile/src/components/CardPaymentForm.tsx`, `apps/mobile/app/checkout/index.tsx`, ve 7 deep-link ekranı.

- [ ] **Step 1: CardPaymentForm 3DS WebView — "Vazgeç" affordance**

`Read` CardPaymentForm 3DS WebView render'ı (`threeDSHtml` varken WebView gösteren blok, `onNavigationStateChange`/`onNav` ~L215-222). WebView'in üstüne bir kapat/vazgeç butonu ekle: kullanıcı banka sayfasında takılırsa 3DS'i iptal edip forma dönebilsin:
```tsx
// WebView'i saran View'in içine, üstte:
<Pressable onPress={() => { setThreeDSHtml(null); setProcessing(false); }} style={{ padding: 12, alignSelf: 'flex-end' }}>
  <Text style={{ color: colors.primary[600]! , fontWeight: '600' }}>Vazgeç</Text>
</Pressable>
```
(Gerçek state setter adlarını dosyadan doğrula. `Pressable`/`Text`/`colors` importları yoksa ekle.)

- [ ] **Step 2: checkout OTP modal — hata sonrası kapatılabilirlik**

`Read apps/mobile/app/checkout/index.tsx` OTP modal bloğu (`otpModalOpen`, `otpError`, ~L1027-1054) ve `proceedCheckout`'un OTP hata dönüşü (~L523-525). OTP modalında **her zaman** bir "Kapat"/İptal yolu olduğundan emin ol: modalın `onClose`'u `setOtpModalOpen(false)` + `setOtpError(null)` yapmalı ve bu buton hata durumunda da erişilebilir olmalı (buton `loading`'e bağlı disable ise, hata sonrası `loading=false` olduğundan zaten erişilebilir — doğrula; değilse ayrı bir İptal butonu ekle). Davranış-koruyan: sadece çıkış garantisi.

- [ ] **Step 3: Back-guard'ları uygula (7 ekran)**

Şu dosyalarda, belirtilen `router.back()` çağrılarını (hata/not-found ve üst-back butonları) mevcut kod desenine çevir:
```tsx
router.canGoBack() ? router.back() : router.replace('/(tabs)')
```
Dosyalar ve konumlar (denetimden):
- `app/seller/[id].tsx:126`
- `app/orders/[id].tsx:637`
- `app/product/[id]/index.tsx:262`
- `app/offers/[id].tsx:110`
- `app/collections/[id]/index.tsx:123`
- `app/collections/[id]/edit.tsx:198` ve `:211`
- `app/messages/[threadId].tsx:228` ve `:257`
Her dosyada `router` zaten import edili (çağrı zaten var). Sadece çıplak `router.back()`'i guard'lı ifadeyle değiştir; başka mantığa dokunma.

- [ ] **Step 4: Derleme**

Run: `cd /Users/gorkemsubas/dev/tarodan-app/apps/mobile && npx tsc --noEmit 2>&1 | grep -iE "CardPaymentForm|checkout/index|seller/\[id\]|orders/\[id\]|product/\[id\]|offers/\[id\]|collections/\[id\]|messages/\[threadId\]" && echo HATA || echo temiz`
Expected: `temiz`.

- [ ] **Step 5: Commit**
```bash
cd /Users/gorkemsubas/dev/tarodan-app
git add apps/mobile/src/components/CardPaymentForm.tsx apps/mobile/app/checkout/index.tsx "apps/mobile/app/seller/[id].tsx" "apps/mobile/app/orders/[id].tsx" "apps/mobile/app/product/[id]/index.tsx" "apps/mobile/app/offers/[id].tsx" "apps/mobile/app/collections/[id]/index.tsx" "apps/mobile/app/collections/[id]/edit.tsx" "apps/mobile/app/messages/[threadId].tsx"
git commit -m "fix(mobile/ios): 3DS/OTP çıkış affordance + deep-link ekranlarında back-guard"
```

---

## Self-Review
- **Spec coverage:** Bölüm 0→Task 1; Bölüm 1→Task 2-6 (security 4 modal, MakeOffer, AddToCollection, Share, FeaturedListings); Bölüm 2→Task 7; Bölüm 3→Task 8; Bölüm 4→Task 9; Bölüm 5→Task 10 (3DS/OTP/back). offers/index.tsx bilinçli DIŞARIDA (catch zaten `cancelled` guard'lı — spec'te de not edildi). ✓
- **Placeholder taraması:** Primitive + spesifik fix'ler tam kodlu; pattern-task'larda (3-6) hedef handler'lar + dönüşüm kuralı + somut örnek verildi, implementer dosyayı okuyup uygular (mekanik desen). TBD/TODO yok. ✓
- **Tip tutarlılığı:** `useModalMessage()` → `{ state, info, error, clear }`, `<ModalMessage state=... />`, `alertAfterClose(close, title, message?, delayMs?)` — Task 1'de tanımlı, Task 2-6'da aynı imzayla kullanılıyor. `ModalMessageState` tipi tutarlı. ✓
- **"Bozma" güvencesi:** Her task tsc + izole commit + review kapısı; başarı/onSuccess yollarına dokunulmuyor; splash/checkout/boost fix'leri davranış-koruyan. ✓
