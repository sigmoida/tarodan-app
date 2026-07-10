import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { HStack, Screen, Text, VStack, theme } from '@tarodan/ui-native';

import { BrandLogo } from '../../../src/components/BrandLogo';
import { styles } from './_lib/styles';
import { useLogin } from './_hooks/useLogin';
import { LoginCard } from './_components/LoginCard';

const { colors } = theme;

/**
 * Login — THIN screen. The `useLogin` controller owns the RHF form, login/resend
 * mutations, and social sign-in; this file composes the back button, brand
 * header, login card, and footer links.
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const f = useLogin();

  return (
    <Screen center style={styles.screen}>
      <Pressable
        testID="login-back-button"
        onPress={f.continueAsGuest}
        accessibilityRole="button"
        accessibilityLabel="Ana sayfaya dön"
        hitSlop={12}
        style={[styles.backButton, { top: insets.top + 8 }]}
      >
        <Ionicons name="arrow-back" size={26} color={colors.white} />
      </Pressable>

      <VStack gap={5}>
        {/* Markalı başlık — turuncu zemin üzerinde Tarodan logosu (logo şeffaf;
            beyaz "TARO" ancak turuncu arka planda görünür) + slogan */}
        <View style={styles.brandHeader}>
          <BrandLogo />
        </View>

        <LoginCard f={f} />

        <VStack gap={2} style={{ marginTop: 4 }}>
          <HStack justify="center" wrap gap={2}>
            <Text variant="body" style={styles.footerText}>Hesabınız yok mu?</Text>
            <Text
              variant="body"
              weight="bold"
              style={styles.footerLink}
              onPress={() => router.push('/(auth)/register' as never)}
            >
              Kayıt olun
            </Text>
          </HStack>

          <HStack justify="center" wrap gap={2}>
            <Text variant="bodySm" style={styles.footerText}>
              İşletme sahibi misiniz?
            </Text>
            <Text
              variant="bodySm"
              weight="bold"
              style={styles.footerLink}
              onPress={() => router.push('/(auth)/register-business' as never)}
            >
              Kurumsal hesap açın
            </Text>
          </HStack>
        </VStack>
      </VStack>
    </Screen>
  );
}
