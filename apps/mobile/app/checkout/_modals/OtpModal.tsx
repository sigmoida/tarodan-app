import React from 'react';
import { Modal, Button, Input, Text, theme } from '@tarodan/ui-native';

const { colors } = theme;

/** Misafir e-posta doğrulama (OTP) modalı. */
export function OtpModal({
  visible,
  onClose,
  email,
  otpCode,
  setOtpCode,
  otpError,
  otpExpiresIn,
  otpSending,
  loading,
  onSubmit,
  onResend,
}: {
  visible: boolean;
  onClose: () => void;
  email: string;
  otpCode: string;
  setOtpCode: (v: string) => void;
  otpError: string | null;
  otpExpiresIn: number;
  otpSending: boolean;
  loading: boolean;
  onSubmit: () => void;
  onResend: () => void;
}) {
  return (
    <Modal isOpen={visible} onClose={onClose} title="E-posta Doğrulama">
      <Text style={{ marginBottom: theme.spacing[3], color: colors.text.muted }}>
        {email} adresine gönderilen 6 haneli kodu girin.
      </Text>
      <Input
        label="Doğrulama kodu"
        value={otpCode}
        onChangeText={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        error={otpError ?? undefined}
        testID="guest-otp-input"
      />
      <Button
        title="Doğrula ve Öde"
        onPress={onSubmit}
        disabled={otpCode.length !== 6}
        isLoading={loading}
        testID="guest-otp-submit"
      />
      <Button
        title={otpExpiresIn > 0 ? `Tekrar gönder (${otpExpiresIn}s)` : 'Kodu tekrar gönder'}
        variant="ghost"
        onPress={onResend}
        disabled={otpExpiresIn > 0 || otpSending}
        testID="guest-otp-resend"
      />
    </Modal>
  );
}
