import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text, Button, Card, Switch, TextInput, Dialog, Portal, ActivityIndicator } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { userApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';

export default function SecuritySettingsScreen() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled || false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // 2FA setup
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQr, setTotpQr] = useState('');
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
      await userApi.changePassword({
        currentPassword,
        newPassword,
      });
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
      const response = await userApi.setupTwoFactor();
      const data = response.data;
      setTotpSecret(data.secret);
      setTotpQr(data.qrCode);
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
      await userApi.verifyTwoFactor({ token: verificationCode });
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
              await userApi.disableTwoFactor();
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
              await userApi.logoutAllDevices();
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Güvenlik Ayarları</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Password Section */}
        <Text style={styles.sectionTitle}>Şifre</Text>
        <Card style={styles.card}>
          <Card.Content>
            <TouchableOpacity 
              style={styles.settingRow}
              onPress={() => setShowPasswordDialog(true)}
            >
              <View style={styles.settingInfo}>
                <Ionicons name="lock-closed-outline" size={24} color={TarodanColors.primary} />
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>Şifre Değiştir</Text>
                  <Text style={styles.settingSubtitle}>Son değişiklik: Bilinmiyor</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
            </TouchableOpacity>
          </Card.Content>
        </Card>

        {/* Two-Factor Auth */}
        <Text style={styles.sectionTitle}>İki Faktörlü Doğrulama (2FA)</Text>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Ionicons name="shield-checkmark-outline" size={24} color={TarodanColors.primary} />
                <View style={styles.settingText}>
                  <Text style={styles.settingTitle}>2FA</Text>
                  <Text style={styles.settingSubtitle}>
                    {twoFactorEnabled ? 'Aktif' : 'Devre dışı'}
                  </Text>
                </View>
              </View>
              <Switch
                value={twoFactorEnabled}
                onValueChange={(value) => {
                  if (value) {
                    handleSetupTwoFactor();
                  } else {
                    handleDisableTwoFactor();
                  }
                }}
                color={TarodanColors.primary}
              />
            </View>
            <Text style={styles.infoText}>
              İki faktörlü doğrulama, hesabınıza ek bir güvenlik katmanı ekler. 
              Google Authenticator veya benzeri bir uygulama gereklidir.
            </Text>
          </Card.Content>
        </Card>

        {/* Sessions */}
        <Text style={styles.sectionTitle}>Oturumlar</Text>
        <Card style={styles.card}>
          <Card.Content>
            <TouchableOpacity 
              style={styles.settingRow}
              onPress={handleLogoutAllDevices}
            >
              <View style={styles.settingInfo}>
                <Ionicons name="log-out-outline" size={24} color={TarodanColors.error} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingTitle, { color: TarodanColors.error }]}>
                    Tüm Cihazlardan Çıkış
                  </Text>
                  <Text style={styles.settingSubtitle}>
                    Diğer tüm cihazlarda oturumunuzu sonlandırın
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </Card.Content>
        </Card>

        {/* Security Tips */}
        <Text style={styles.sectionTitle}>Güvenlik İpuçları</Text>
        <Card style={styles.tipsCard}>
          <Card.Content>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.tipText}>Güçlü ve benzersiz bir şifre kullanın</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.tipText}>İki faktörlü doğrulamayı aktifleştirin</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.tipText}>Şifrenizi düzenli olarak değiştirin</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.tipText}>Şüpheli aktiviteleri bildirin</Text>
            </View>
          </Card.Content>
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Password Change Dialog */}
      <Portal>
        <Dialog visible={showPasswordDialog} onDismiss={() => setShowPasswordDialog(false)}>
          <Dialog.Title>Şifre Değiştir</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Mevcut Şifre"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              mode="outlined"
              secureTextEntry
              style={styles.dialogInput}
            />
            <TextInput
              label="Yeni Şifre"
              value={newPassword}
              onChangeText={setNewPassword}
              mode="outlined"
              secureTextEntry
              style={styles.dialogInput}
            />
            <TextInput
              label="Yeni Şifre Tekrar"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              mode="outlined"
              secureTextEntry
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowPasswordDialog(false)}>İptal</Button>
            <Button onPress={handlePasswordChange} loading={loading}>Değiştir</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* 2FA Setup Dialog */}
      <Portal>
        <Dialog visible={showTwoFactorSetup} onDismiss={() => setShowTwoFactorSetup(false)}>
          <Dialog.Title>2FA Kurulumu</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              Google Authenticator veya benzeri bir uygulamayı kullanarak aşağıdaki kodu tarayın veya manuel olarak girin:
            </Text>
            {totpSecret ? (
              <View style={styles.secretContainer}>
                <Text style={styles.secretText}>{totpSecret}</Text>
              </View>
            ) : (
              <ActivityIndicator size="small" color={TarodanColors.primary} />
            )}
            <TextInput
              label="Doğrulama Kodu"
              value={verificationCode}
              onChangeText={setVerificationCode}
              mode="outlined"
              keyboardType="numeric"
              maxLength={6}
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowTwoFactorSetup(false)}>İptal</Button>
            <Button onPress={handleVerifyTwoFactor} loading={loading}>Doğrula</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 12,
    marginTop: 16,
  },
  card: {
    backgroundColor: TarodanColors.background,
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
    color: TarodanColors.textPrimary,
  },
  settingSubtitle: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  infoText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 12,
    lineHeight: 18,
  },
  tipsCard: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipText: {
    marginLeft: 12,
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  dialogInput: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  dialogText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  secretContainer: {
    backgroundColor: TarodanColors.surfaceVariant,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  secretText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
});
