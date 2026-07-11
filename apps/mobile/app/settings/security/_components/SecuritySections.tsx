import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Card, Switch, Button, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';

import { styles } from '../_lib/styles';
import type { SecurityController } from '../_hooks/useSecurity';

const { colors } = theme;

/** Password / 2FA / phone-verification / sessions / tips cards. */
export function SecuritySections({ f }: { f: SecurityController }) {
  const { t } = f;
  return (
    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
      {/* Password Section */}
      <Text style={styles.sectionTitle}>{t('mobile.password')}</Text>
      <Card style={styles.card}>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => { f.pwMsg.clear(); f.setShowPasswordDialog(true); }}
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
                {f.twoFactorEnabled ? 'Aktif' : 'Devre dışı'}
              </Text>
            </View>
          </View>
          <Switch
            value={f.twoFactorEnabled}
            onValueChange={(value: boolean) => {
              if (value) {
                f.handleSetupTwoFactor();
              } else {
                f.handleDisableTwoFactor();
              }
            }}
          />
        </View>
        <Text style={styles.infoText}>
          İki faktörlü doğrulama, hesabınıza ek bir güvenlik katmanı ekler.
          Google Authenticator veya benzeri bir uygulama gereklidir.
        </Text>
        {f.twoFactorEnabled ? (
          <Button
            variant="outline"
            title="Yedek Kodları Yenile"
            onPress={() => {
              f.setNewBackupCodes(null);
              f.setRegenerateCode('');
              f.regenMsg.clear();
              f.setShowRegenerateDialog(true);
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
                {f.phoneVerified ? 'Telefon numaranız doğrulandı.' : 'SMS ile doğrulayın.'}
              </Text>
            </View>
          </View>
        </View>
        {f.phoneVerified ? (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
            <Text style={styles.verifiedText}>Doğrulandı</Text>
          </View>
        ) : (
          <Button
            title="Doğrula"
            onPress={() => {
              f.setPhoneInput(f.user?.phone || '');
              f.setPhoneStep('enter');
              f.setPhoneCode('');
              f.setPhoneMsg(null);
              f.setShowPhoneDialog(true);
            }}
            testID="phone-verify-button"
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      {/* Sessions */}
      <Text style={styles.sectionTitle}>{t('mobile.sessions')}</Text>
      <Card style={styles.card}>
        <TouchableOpacity style={styles.settingRow} onPress={f.handleLogoutAllDevices}>
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
  );
}
