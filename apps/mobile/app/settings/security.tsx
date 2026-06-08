import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
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
} from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { authApi } from '../../src/services/api';
import { useTranslation } from '../../src/i18n';

const { colors } = theme;

export default function SecuritySettingsScreen() {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [twoFactorEnabled, setTwoFactorEnabled] = useState((user as any)?.twoFactorEnabled || false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [loading, setLoading] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2FA setup
  const [totpSecret, setTotpSecret] = useState('');
  const [, setTotpQr] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  if (!isAuthenticated) {
    router.replace('/(auth)/login');
    return null;
  }

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      Alert.alert('Hata', 'Şifreler eşleşmiyor');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Hata', 'Şifre en az 8 karakter olmalıdır');
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      Alert.alert('Başarılı', 'Şifreniz değiştirildi');
      setShowPasswordDialog(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      Alert.alert('Hata', error.response?.data?.message || 'Şifre değiştirilemedi');
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
      setShowTwoFactorSetup(true);
    } catch (error: any) {
      Alert.alert('Hata', error.response?.data?.message || '2FA kurulumu başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (verificationCode.length !== 6) {
      Alert.alert('Hata', 'Lütfen 6 haneli doğrulama kodunu girin');
      return;
    }

    setLoading(true);
    try {
      await authApi.verifyTwoFactor(verificationCode);
      setTwoFactorEnabled(true);
      setShowTwoFactorSetup(false);
      setVerificationCode('');
      Alert.alert('Başarılı', 'İki faktörlü doğrulama aktifleştirildi');
    } catch (error: any) {
      Alert.alert('Hata', error.response?.data?.message || 'Doğrulama başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    Alert.alert(
      'İki Faktörlü Doğrulamayı Kapat',
      'Bu işlem hesabınızın güvenliğini azaltacaktır. Devam etmek istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kapat',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await authApi.disableTwoFactor();
              setTwoFactorEnabled(false);
              Alert.alert('Başarılı', 'İki faktörlü doğrulama kapatıldı');
            } catch (error: any) {
              Alert.alert('Hata', error.response?.data?.message || 'İşlem başarısız');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleLogoutAllDevices = () => {
    Alert.alert(
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
              Alert.alert('Hata', 'İşlem başarısız');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.settingsSecurity')} onBack={() => router.back()} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Password Section */}
        <Text style={styles.sectionTitle}>{t('mobile.password')}</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setShowPasswordDialog(true)}
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
      <Modal isOpen={showPasswordDialog} onClose={() => setShowPasswordDialog(false)} title="Şifre Değiştir">
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
          <Button variant="ghost" title={t('mobile.cancel')} onPress={() => setShowPasswordDialog(false)} />
          <Button variant="primary" title={t('mobile.change')} onPress={handlePasswordChange} isLoading={loading} />
        </View>
      </Modal>

      {/* 2FA Setup Dialog */}
      <Modal isOpen={showTwoFactorSetup} onClose={() => setShowTwoFactorSetup(false)} title="2FA Kurulumu">
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
          <Button variant="ghost" title={t('mobile.cancel')} onPress={() => setShowTwoFactorSetup(false)} />
          <Button variant="primary" title={t('mobile.verify')} onPress={handleVerifyTwoFactor} isLoading={loading} />
        </View>
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
});
