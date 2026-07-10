import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { appAlert, useModalMessage, alertAfterClose } from '@tarodan/ui-native';
import { useAuthStore } from '../../../../src/stores/authStore';
import { authApi } from '../../../../src/services/api';
import { useTranslation } from '../../../../src/i18n';

/**
 * Güvenlik ekranı controller'ı — şifre değiştirme, 2FA kurulum/kapat/yedek-kod,
 * telefon doğrulama akışlarının tüm state'i, effect'leri ve handler'ları. Lifted
 * verbatim from the monolithic SecuritySettingsScreen. appAlert modal AÇIKKEN
 * donma yaptığı için modal-içi geri bildirimler useModalMessage ile gösterilir.
 */
export function useSecurity() {
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

  return {
    t,
    isAuthenticated,
    loading,
    // 2FA
    twoFactorEnabled,
    handleSetupTwoFactor,
    handleDisableTwoFactor,
    showTwoFactorSetup,
    setShowTwoFactorSetup,
    twoFaMsg,
    totpSecret,
    verificationCode,
    setVerificationCode,
    handleVerifyTwoFactor,
    showDisableDialog,
    setShowDisableDialog,
    disableMsg,
    disableCode,
    setDisableCode,
    confirmDisableTwoFactor,
    // backup codes
    showRegenerateDialog,
    setShowRegenerateDialog,
    regenMsg,
    newBackupCodes,
    setNewBackupCodes,
    regenerateCode,
    setRegenerateCode,
    handleRegenerateBackupCodes,
    // password
    showPasswordDialog,
    setShowPasswordDialog,
    pwMsg,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    handlePasswordChange,
    // phone
    user,
    phoneVerified,
    showPhoneDialog,
    setShowPhoneDialog,
    phoneInput,
    setPhoneInput,
    phoneCode,
    setPhoneCode,
    phoneStep,
    setPhoneStep,
    phoneMsg,
    setPhoneMsg,
    resendIn,
    handleSendPhoneCode,
    handleVerifyPhone,
    // sessions
    handleLogoutAllDevices,
  };
}

export type SecurityController = ReturnType<typeof useSecurity>;
