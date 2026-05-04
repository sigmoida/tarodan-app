import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal, Modal, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TarodanColors } from '../../theme';
import { Text } from './PaperCompat';

interface AuthRequiredSheetProps {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  message?: string;
  /** Girişten sonra yönlendirilecek ekran (opsiyonel) */
  redirectTo?: string;
}

/**
 * Giriş gerektiren işlemlerde açılan alt sayfa. Web'deki AuthRequiredModal paritesi.
 */
export function AuthRequiredSheet({
  visible,
  onDismiss,
  title = 'Giriş Gerekli',
  message = 'Bu özelliği kullanabilmek için hesabınıza giriş yapmanız gerekiyor.',
  redirectTo,
}: AuthRequiredSheetProps) {
  const goLogin = () => {
    onDismiss();
    const url = redirectTo
      ? `/(auth)/login?redirectTo=${encodeURIComponent(redirectTo)}`
      : '/(auth)/login';
    router.push(url as any);
  };

  const goRegister = () => {
    onDismiss();
    router.push('/(auth)/register');
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed-outline" size={32} color={TarodanColors.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <Button
          mode="contained"
          buttonColor={TarodanColors.primary}
          onPress={goLogin}
          style={styles.primaryBtn}
          contentStyle={styles.btnContent}
        >
          Giriş Yap
        </Button>
        <Button
          mode="outlined"
          onPress={goRegister}
          textColor={TarodanColors.primary}
          style={styles.secondaryBtn}
          contentStyle={styles.btnContent}
        >
          Hesap Oluştur
        </Button>
        <Button mode="text" onPress={onDismiss} textColor={TarodanColors.textSecondary}>
          Vazgeç
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: TarodanColors.background,
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: TarodanColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
  },
  primaryBtn: {
    width: '100%',
    borderRadius: 10,
    marginBottom: 8,
  },
  secondaryBtn: {
    width: '100%',
    borderRadius: 10,
    borderColor: TarodanColors.primary,
    marginBottom: 8,
  },
  btnContent: {
    paddingVertical: 4,
  },
});

export default AuthRequiredSheet;
