import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Button,
  Card,
  Switch,
  Modal,
  Spinner,
  Input,
  Text,
  theme,
  ScreenHeader,
  appAlert,
  useModalMessage,
  ModalMessage,
  alertAfterClose,
} from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { authApi } from '../../src/services/api';
import { useTranslation } from '../../src/i18n';

const { colors } = theme;

export default function SecuritySettingsScreen() {
  const { t } = useTranslation();
  const { isAuthenticated, logout, user, refreshUserData } = useAuthStore();
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [loading, setLoading] = useState(false);

  // Disable / yedek kod yenileme: backend her ikisinde de geçerli TOTP kodu ister.
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateCode, setRegenerateCode] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);

  // Gerçek 2FA durumunu sunucudan çek (user nesnesinde twoFactorEnabled yok —
  // o alan yalnız AdminUser'da; normal kullanıcıda kaynak TwoFactorSecret.isEnabled).
  useEffect(() => {
    let active = true;
    authApi
      .getTwoFactorStatus()
      .then((res) => {
        const payload = (res.data as any)?.data ?? (res.data as any) ?? {};
        if (active) setTwoFactorEnabled(!!payload.isEnabled);
      })
      .catch(() => {
        /* sessizce yoksay: durum bilinmiyorsa kapalı varsay */
      });
    return () => {
      active = false;
    };
  }, []);

  // Telefon doğrulama
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'enter' | 'verify'>('enter');
  const [phoneVerified, setPhoneVerified] = useState(!!user?.isPhoneVerified);
  const [resendIn, setResendIn] = useState(0);
  // Modal-içi mesaj (bilgi/hata). appAlert modal AÇIKKEN çağrılırsa iOS'ta iki
  // transparent RNModal üst üste gelir ve dokunuşları kilitler → uygulama donar.
  // Bu yüzden modal içindeki geri bildirimleri alert yerine burada gösteriyoruz.
  const [phoneMsg, setPhoneMsg] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  // 4 ayrı modal için mesaj örnekleri (şifre / 2FA kurulum / 2FA kapat / yedek kod)
  const pwMsg = useModalMessage();
  const twoFaMsg = useModalMessage();
  const disableMsg = useModalMessage();
  const regenMsg = useModalMessage();

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const handleSendPhoneCode = async () => {
    setLoading(true);
    setPhoneMsg(null);
    try {
      await authApi.sendPhoneCode(phoneInput);
      setPhoneStep('verify');
      setResendIn(60);
      // Modal açık: alert yerine modal-içi bilgi mesajı (iç içe modal donmasını önler).
      setPhoneMsg({ type: 'info', text: 'Doğrulama kodu telefonunuza gönderildi' });
    } catch (e: any) {
      setPhoneMsg({ type: 'error', text: e?.response?.data?.message || 'Kod gönderilemedi' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    setLoading(true);
    setPhoneMsg(null);
    try {
      await authApi.verifyPhone(phoneCode);
      setPhoneVerified(true);
      await refreshUserData();
      // Önce modal'ı kapat, başarı alert'ini modal TAMAMEN kapandıktan sonra göster.
      // Aynı anda kapatıp açmak iOS'ta modal sunum çakışması → donma yapıyordu.
      setShowPhoneDialog(false);
      setPhoneStep('enter');
      setPhoneCode('');
      setPhoneMsg(null);
      setTimeout(() => appAlert('Başarılı', 'Telefon numaranız doğrulandı'), 400);
    } catch (e: any) {
      // Hata da modal açıkken: alert yerine modal-içi hata mesajı.
      setPhoneMsg({ type: 'error', text: e?.response?.data?.message || 'Kod hatalı' });
    } finally {
      setLoading(false);
    }
  };

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2FA setup
  const [totpSecret, setTotpSecret] = useState('');
  const [, setTotpQr] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  // Yönlendirmeyi render sırasında değil effect'te yap; render içinde router.replace
  // "Cannot update a component while rendering another" uyarısına yol açıyordu.
  useEffect(() => {
    if (!isAuthenticated) router.replace('/(auth)/login');
  }, [isAuthenticated]);
  if (!isAuthenticated) return null;

  const handlePasswordChange = async () => {
    pwMsg.clear();
    if (newPassword !== confirmPassword) {
      pwMsg.error('Şifreler eşleşmiyor');
      return;
    }

    // API ChangePasswordDto ile birebir aynı kural — yoksa ham 400 dönüyordu
    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!strongPassword.test(newPassword)) {
      pwMsg.error(
        'Şifre en az 8 karakter, bir büyük harf, bir küçük harf, bir rakam ve bir özel karakter (@$!%*?&) içermelidir'
      );
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      alertAfterClose(() => setShowPasswordDialog(false), 'Başarılı', 'Şifreniz değiştirildi');
    } catch (error: any) {
      pwMsg.error(error.response?.data?.message || 'Şifre değiştirilemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupTwoFactor = async () => {
    setLoading(true);
    try {
      const response = await authApi.setupTwoFactor();
      const payload = (response.data as any)?.data ?? (response.data as any) ?? {};
      setTotpSecret(payload.secret ?? '');
      setTotpQr(payload.qrCode ?? '');
      twoFaMsg.clear();
      setShowTwoFactorSetup(true);
    } catch (error: any) {
      appAlert('Hata', error.response?.data?.message || '2FA kurulumu başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    twoFaMsg.clear();
    if (verificationCode.length !== 6) {
      twoFaMsg.error('Lütfen 6 haneli doğrulama kodunu girin');
      return;
    }

    setLoading(true);
    try {
      await authApi.verifyTwoFactor(verificationCode);
      setTwoFactorEnabled(true);
      setVerificationCode('');
      alertAfterClose(() => setShowTwoFactorSetup(false), 'Başarılı', 'İki faktörlü doğrulama aktifleştirildi');
    } catch (error: any) {
      twoFaMsg.error(error.response?.data?.message || 'Doğrulama başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableTwoFactor = () => {
    // Backend disable için geçerli TOTP kodu ister; kod giriş dialog'unu aç.
    setDisableCode('');
    disableMsg.clear();
    setShowDisableDialog(true);
  };

  const confirmDisableTwoFactor = async () => {
    disableMsg.clear();
    if (disableCode.length !== 6) {
      disableMsg.error('Lütfen 6 haneli doğrulama kodunu girin');
      return;
    }
    setLoading(true);
    try {
      await authApi.disableTwoFactor(disableCode);
      setTwoFactorEnabled(false);
      setDisableCode('');
      alertAfterClose(() => setShowDisableDialog(false), 'Başarılı', 'İki faktörlü doğrulama kapatıldı');
    } catch (error: any) {
      disableMsg.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    regenMsg.clear();
    if (regenerateCode.length !== 6) {
      regenMsg.error('Lütfen 6 haneli doğrulama kodunu girin');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.regenerateBackupCodes(regenerateCode);
      const data: any = res.data;
      const codes: string[] = Array.isArray(data) ? data : data?.backupCodes ?? data?.data ?? [];
      setNewBackupCodes(codes);
      setRegenerateCode('');
    } catch (error: any) {
      regenMsg.error(error.response?.data?.message || 'Yedek kodlar yenilenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutAllDevices = () => {
    appAlert(
      'Tüm Cihazlardan Çıkış',
      'Tüm cihazlardan çıkış yapılacak ve tekrar giriş yapmanız gerekecek.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            try {
              await authApi.logoutAll();
              logout();
              router.replace('/(auth)/login');
            } catch (error) {
              appAlert('Hata', 'İşlem başarısız');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.settingsSecurity')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Password Section */}
        <Text style={styles.sectionTitle}>{t('mobile.password')}</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => { pwMsg.clear(); setShowPasswordDialog(true); }}
          >
            <View style={styles.settingInfo}>
              <Ionicons name="lock-closed-outline" size={24} color={colors.primary[600]!} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Şifre Değiştir</Text>
                <Text style={styles.settingSubtitle}>Son değişiklik: Bilinmiyor</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.subtle} />
          </TouchableOpacity>
        </Card>

        {/* Two-Factor Auth */}
        <Text style={styles.sectionTitle}>İki Faktörlü Doğrulama (2FA)</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="shield-checkmark-outline" size={24} color={colors.primary[600]!} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>2FA</Text>
                <Text style={styles.settingSubtitle}>
                  {twoFactorEnabled ? 'Aktif' : 'Devre dışı'}
                </Text>
              </View>
            </View>
            <Switch
              value={twoFactorEnabled}
              onValueChange={(value: boolean) => {
                if (value) {
                  handleSetupTwoFactor();
                } else {
                  handleDisableTwoFactor();
                }
              }}
            />
          </View>
          <Text style={styles.infoText}>
            İki faktörlü doğrulama, hesabınıza ek bir güvenlik katmanı ekler.
            Google Authenticator veya benzeri bir uygulama gereklidir.
          </Text>
          {twoFactorEnabled ? (
            <Button
              variant="outline"
              title="Yedek Kodları Yenile"
              onPress={() => {
                setNewBackupCodes(null);
                setRegenerateCode('');
                regenMsg.clear();
                setShowRegenerateDialog(true);
              }}
              style={{ marginTop: 12 }}
            />
          ) : null}
        </Card>

        {/* Phone Verification */}
        <Text style={styles.sectionTitle}>Telefon Doğrulama</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="call-outline" size={24} color={colors.primary[600]!} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Telefon Doğrulama</Text>
                <Text style={styles.settingSubtitle}>
                  {phoneVerified ? 'Telefon numaranız doğrulandı.' : 'SMS ile doğrulayın.'}
                </Text>
              </View>
            </View>
          </View>
          {phoneVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
              <Text style={styles.verifiedText}>Doğrulandı</Text>
            </View>
          ) : (
            <Button
              title="Doğrula"
              onPress={() => {
                setPhoneInput(user?.phone || '');
                setPhoneStep('enter');
                setPhoneCode('');
                setPhoneMsg(null);
                setShowPhoneDialog(true);
              }}
              testID="phone-verify-button"
              style={{ marginTop: 12 }}
            />
          )}
        </Card>

        {/* Sessions */}
        <Text style={styles.sectionTitle}>{t('mobile.sessions')}</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleLogoutAllDevices}
          >
            <View style={styles.settingInfo}>
              <Ionicons name="log-out-outline" size={24} color={colors.danger[600]!} />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: colors.danger[600]! }]}>
                  Tüm Cihazlardan Çıkış
                </Text>
                <Text style={styles.settingSubtitle}>
                  Diğer tüm cihazlarda oturumunuzu sonlandırın
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Card>

        {/* Security Tips */}
        <Text style={styles.sectionTitle}>Güvenlik İpuçları</Text>
        <Card style={styles.tipsCard}>
          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
            <Text style={styles.tipText}>{t('mobile.tipStrongPassword')}</Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
            <Text style={styles.tipText}>{t('mobile.tipTwoFactor')}</Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
            <Text style={styles.tipText}>{t('mobile.tipChangePassword')}</Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
            <Text style={styles.tipText}>{t('mobile.tipReportSuspicious')}</Text>
          </View>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Password Change Dialog */}
      <Modal isOpen={showPasswordDialog} onClose={() => { setShowPasswordDialog(false); pwMsg.clear(); }} title="Şifre Değiştir">
        <Input
          label="Mevcut Şifre"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          containerStyle={styles.dialogInput}
        />
        <Input
          label="Yeni Şifre"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          containerStyle={styles.dialogInput}
        />
        <Input
          label="Yeni Şifre Tekrar"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          containerStyle={styles.dialogInput}
        />
        <View style={styles.dialogActions}>
          <Button variant="ghost" title={t('mobile.cancel')} onPress={() => { setShowPasswordDialog(false); pwMsg.clear(); }} />
          <Button variant="primary" title={t('mobile.change')} onPress={handlePasswordChange} isLoading={loading} />
        </View>
        <ModalMessage state={pwMsg.state} />
      </Modal>

      {/* 2FA Setup Dialog */}
      <Modal isOpen={showTwoFactorSetup} onClose={() => { setShowTwoFactorSetup(false); twoFaMsg.clear(); }} title="2FA Kurulumu">
        <Text style={styles.dialogText}>
          Google Authenticator veya benzeri bir uygulamayı kullanarak aşağıdaki kodu tarayın veya manuel olarak girin:
        </Text>
        {totpSecret ? (
          <View style={styles.secretContainer}>
            <Text style={styles.secretText}>{totpSecret}</Text>
          </View>
        ) : (
          <Spinner size="sm" />
        )}
        <Input
          label="Doğrulama Kodu"
          value={verificationCode}
          onChangeText={setVerificationCode}
          keyboardType="numeric"
          maxLength={6}
          containerStyle={styles.dialogInput}
        />
        <View style={styles.dialogActions}>
          <Button variant="ghost" title={t('mobile.cancel')} onPress={() => { setShowTwoFactorSetup(false); twoFaMsg.clear(); }} />
          <Button variant="primary" title={t('mobile.verify')} onPress={handleVerifyTwoFactor} isLoading={loading} />
        </View>
        <ModalMessage state={twoFaMsg.state} />
      </Modal>

      {/* 2FA Disable Dialog — backend geçerli TOTP kodu ister */}
      <Modal isOpen={showDisableDialog} onClose={() => { setShowDisableDialog(false); disableMsg.clear(); }} title="2FA'yı Kapat">
        <Text style={styles.dialogText}>
          İki faktörlü doğrulamayı kapatmak için uygulamanızdaki 6 haneli kodu girin.
        </Text>
        <Input
          label="Doğrulama Kodu"
          value={disableCode}
          onChangeText={setDisableCode}
          keyboardType="numeric"
          maxLength={6}
          containerStyle={styles.dialogInput}
        />
        <View style={styles.dialogActions}>
          <Button variant="ghost" title={t('mobile.cancel')} onPress={() => { setShowDisableDialog(false); disableMsg.clear(); }} />
          <Button variant="danger" title="Kapat" onPress={confirmDisableTwoFactor} isLoading={loading} />
        </View>
        <ModalMessage state={disableMsg.state} />
      </Modal>

      {/* Phone Verification Dialog */}
      <Modal isOpen={showPhoneDialog} onClose={() => { setShowPhoneDialog(false); setPhoneMsg(null); }} title="Telefon Doğrulama">
        {phoneStep === 'enter' ? (
          <View style={{ gap: 12 }}>
            <Input
              label="Telefon numarası"
              value={phoneInput}
              onChangeText={setPhoneInput}
              placeholder="+905551234567"
              keyboardType="phone-pad"
              testID="phone-input"
              containerStyle={styles.dialogInput}
            />
            <Button title="Kod Gönder" onPress={handleSendPhoneCode} disabled={loading || !phoneInput} isLoading={loading} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Input
              label="Doğrulama kodu"
              value={phoneCode}
              onChangeText={setPhoneCode}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              testID="phone-code-input"
              containerStyle={styles.dialogInput}
            />
            <Button title="Doğrula" onPress={handleVerifyPhone} disabled={loading || phoneCode.length !== 6} isLoading={loading} />
            <TouchableOpacity onPress={handleSendPhoneCode} disabled={resendIn > 0 || loading}>
              <Text style={{ color: colors.text.muted, textAlign: 'center' }}>
                {resendIn > 0 ? `Tekrar gönder ${resendIn}s` : 'Kodu tekrar gönder'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {phoneMsg && (
          <Text
            testID="phone-message"
            style={{
              marginTop: 12,
              textAlign: 'center',
              color: phoneMsg.type === 'error' ? colors.danger[600]! : colors.text.muted,
            }}
          >
            {phoneMsg.text}
          </Text>
        )}
      </Modal>

      {/* 2FA Backup Codes Regenerate Dialog */}
      <Modal
        isOpen={showRegenerateDialog}
        onClose={() => { setShowRegenerateDialog(false); regenMsg.clear(); }}
        title="Yedek Kodları Yenile"
      >
        {newBackupCodes ? (
          <>
            <Text style={styles.dialogText}>
              Yeni yedek kodlarınız. Güvenli bir yerde saklayın — eski kodlar artık geçersiz.
            </Text>
            <View style={styles.secretContainer}>
              {newBackupCodes.map((code) => (
                <Text key={code} style={styles.secretText}>
                  {code}
                </Text>
              ))}
            </View>
            <View style={styles.dialogActions}>
              <Button variant="primary" title="Tamam" onPress={() => setShowRegenerateDialog(false)} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.dialogText}>
              Yeni yedek kodlar üretmek için uygulamanızdaki 6 haneli kodu girin.
            </Text>
            <Input
              label="Doğrulama Kodu"
              value={regenerateCode}
              onChangeText={setRegenerateCode}
              keyboardType="numeric"
              maxLength={6}
              containerStyle={styles.dialogInput}
            />
            <View style={styles.dialogActions}>
              <Button variant="ghost" title={t('mobile.cancel')} onPress={() => { setShowRegenerateDialog(false); regenMsg.clear(); }} />
              <Button variant="primary" title="Yenile" onPress={handleRegenerateBackupCodes} isLoading={loading} />
            </View>
            <ModalMessage state={regenMsg.state} />
          </>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
    marginTop: 16,
  },
  card: {
    backgroundColor: colors.surface.DEFAULT,
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 16,
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.heading,
  },
  settingSubtitle: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 2,
  },
  infoText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 12,
    lineHeight: 18,
  },
  tipsCard: {
    backgroundColor: colors.gray[100],
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipText: {
    marginLeft: 12,
    fontSize: 14,
    color: colors.text.heading,
  },
  dialogInput: {
    marginBottom: 12,
  },
  dialogText: {
    fontSize: 14,
    color: colors.text.muted,
    marginBottom: 16,
    lineHeight: 20,
  },
  secretContainer: {
    backgroundColor: colors.gray[100],
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  secretText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.text.heading,
    textAlign: 'center',
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  verifiedText: {
    color: colors.success[600]!,
    fontWeight: '600',
  },
});
