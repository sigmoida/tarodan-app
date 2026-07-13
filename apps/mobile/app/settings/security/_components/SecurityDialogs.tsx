import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Modal, Button, Spinner, Input, Text, ModalMessage, theme } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import type { SecurityController } from '../_hooks/useSecurity';

const { colors } = theme;

/** All 5 security modals: password change, 2FA setup/disable, phone verify, backup codes. */
export function SecurityDialogs({ f }: { f: SecurityController }) {
  const { t } = f;
  return (
    <>
      {/* Password Change Dialog */}
      <Modal isOpen={f.showPasswordDialog} onClose={() => { f.setShowPasswordDialog(false); f.pwMsg.clear(); }} title="Şifre Değiştir">
        <Input
          label="Mevcut Şifre"
          value={f.currentPassword}
          onChangeText={f.setCurrentPassword}
          secureTextEntry
          containerStyle={styles.dialogInput}
        />
        <Input
          label="Yeni Şifre"
          value={f.newPassword}
          onChangeText={f.setNewPassword}
          secureTextEntry
          containerStyle={styles.dialogInput}
        />
        <Input
          label="Yeni Şifre Tekrar"
          value={f.confirmPassword}
          onChangeText={f.setConfirmPassword}
          secureTextEntry
          containerStyle={styles.dialogInput}
        />
        <View style={styles.dialogActions}>
          <Button variant="ghost" title={t('mobile.cancel')} onPress={() => { f.setShowPasswordDialog(false); f.pwMsg.clear(); }} />
          <Button variant="primary" title={t('mobile.change')} onPress={f.handlePasswordChange} isLoading={f.loading} />
        </View>
        <ModalMessage state={f.pwMsg.state} />
      </Modal>

      {/* 2FA Setup Dialog */}
      <Modal isOpen={f.showTwoFactorSetup} onClose={() => { f.setShowTwoFactorSetup(false); f.twoFaMsg.clear(); }} title="2FA Kurulumu">
        <Text style={styles.dialogText}>
          Google Authenticator veya benzeri bir uygulamayı kullanarak aşağıdaki kodu tarayın veya manuel olarak girin:
        </Text>
        {f.totpSecret ? (
          <View style={styles.secretContainer}>
            <Text style={styles.secretText}>{f.totpSecret}</Text>
          </View>
        ) : (
          <Spinner size="sm" />
        )}
        <Input
          label="Doğrulama Kodu"
          value={f.verificationCode}
          onChangeText={f.setVerificationCode}
          keyboardType="numeric"
          maxLength={6}
          containerStyle={styles.dialogInput}
        />
        <View style={styles.dialogActions}>
          <Button variant="ghost" title={t('mobile.cancel')} onPress={() => { f.setShowTwoFactorSetup(false); f.twoFaMsg.clear(); }} />
          <Button variant="primary" title={t('mobile.verify')} onPress={f.handleVerifyTwoFactor} isLoading={f.loading} />
        </View>
        <ModalMessage state={f.twoFaMsg.state} />
      </Modal>

      {/* 2FA Disable Dialog — backend geçerli TOTP kodu ister */}
      <Modal isOpen={f.showDisableDialog} onClose={() => { f.setShowDisableDialog(false); f.disableMsg.clear(); }} title="2FA'yı Kapat">
        <Text style={styles.dialogText}>
          İki faktörlü doğrulamayı kapatmak için uygulamanızdaki 6 haneli kodu girin.
        </Text>
        <Input
          label="Doğrulama Kodu"
          value={f.disableCode}
          onChangeText={f.setDisableCode}
          keyboardType="numeric"
          maxLength={6}
          containerStyle={styles.dialogInput}
        />
        <View style={styles.dialogActions}>
          <Button variant="ghost" title={t('mobile.cancel')} onPress={() => { f.setShowDisableDialog(false); f.disableMsg.clear(); }} />
          <Button variant="danger" title="Kapat" onPress={f.confirmDisableTwoFactor} isLoading={f.loading} />
        </View>
        <ModalMessage state={f.disableMsg.state} />
      </Modal>

      {/* Phone Verification Dialog */}
      <Modal isOpen={f.showPhoneDialog} onClose={() => { f.setShowPhoneDialog(false); f.setPhoneMsg(null); }} title="Telefon Doğrulama">
        {f.phoneStep === 'enter' ? (
          <View style={{ gap: theme.spacing[3] }}>
            <Input
              label="Telefon numarası"
              value={f.phoneInput}
              onChangeText={f.setPhoneInput}
              placeholder="+905551234567"
              keyboardType="phone-pad"
              testID="phone-input"
              containerStyle={styles.dialogInput}
            />
            <Button title="Kod Gönder" onPress={f.handleSendPhoneCode} disabled={f.loading || !f.phoneInput} isLoading={f.loading} />
          </View>
        ) : (
          <View style={{ gap: theme.spacing[3] }}>
            <Input
              label="Doğrulama kodu"
              value={f.phoneCode}
              onChangeText={f.setPhoneCode}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              testID="phone-code-input"
              containerStyle={styles.dialogInput}
            />
            <Button title="Doğrula" onPress={f.handleVerifyPhone} disabled={f.loading || f.phoneCode.length !== 6} isLoading={f.loading} />
            <TouchableOpacity onPress={f.handleSendPhoneCode} disabled={f.resendIn > 0 || f.loading}>
              <Text style={{ color: colors.text.muted, textAlign: 'center' }}>
                {f.resendIn > 0 ? `Tekrar gönder ${f.resendIn}s` : 'Kodu tekrar gönder'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {f.phoneMsg && (
          <Text
            testID="phone-message"
            style={{
              marginTop: theme.spacing[3],
              textAlign: 'center',
              color: f.phoneMsg.type === 'error' ? colors.danger[600]! : colors.text.muted,
            }}
          >
            {f.phoneMsg.text}
          </Text>
        )}
      </Modal>

      {/* 2FA Backup Codes Regenerate Dialog */}
      <Modal
        isOpen={f.showRegenerateDialog}
        onClose={() => { f.setShowRegenerateDialog(false); f.regenMsg.clear(); }}
        title="Yedek Kodları Yenile"
      >
        {f.newBackupCodes ? (
          <>
            <Text style={styles.dialogText}>
              Yeni yedek kodlarınız. Güvenli bir yerde saklayın — eski kodlar artık geçersiz.
            </Text>
            <View style={styles.secretContainer}>
              {f.newBackupCodes.map((code) => (
                <Text key={code} style={styles.secretText}>
                  {code}
                </Text>
              ))}
            </View>
            <View style={styles.dialogActions}>
              <Button variant="primary" title="Tamam" onPress={() => f.setShowRegenerateDialog(false)} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.dialogText}>
              Yeni yedek kodlar üretmek için uygulamanızdaki 6 haneli kodu girin.
            </Text>
            <Input
              label="Doğrulama Kodu"
              value={f.regenerateCode}
              onChangeText={f.setRegenerateCode}
              keyboardType="numeric"
              maxLength={6}
              containerStyle={styles.dialogInput}
            />
            <View style={styles.dialogActions}>
              <Button variant="ghost" title={t('mobile.cancel')} onPress={() => { f.setShowRegenerateDialog(false); f.regenMsg.clear(); }} />
              <Button variant="primary" title="Yenile" onPress={f.handleRegenerateBackupCodes} isLoading={f.loading} />
            </View>
            <ModalMessage state={f.regenMsg.state} />
          </>
        )}
      </Modal>
    </>
  );
}
