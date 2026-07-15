import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { HStack, Screen, Text, VStack, theme } from '@tarodan/ui-native';
import { BrandLogo } from '@/components/BrandLogo';
import { useRegister } from './_hooks/useRegister';
import { styles } from './_lib/styles';
import { RegisterForm } from './_components/RegisterForm';

const { colors } = theme;

export default function RegisterScreen() {
  const f = useRegister();
  const insets = useSafeAreaInsets();

  return (
    <Screen center style={styles.screen}>
      <Pressable
        onPress={f.handleBack}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        hitSlop={12}
        style={[styles.backButton, { top: insets.top + 8 }]}
      >
        <Ionicons name="arrow-back" size={26} color={colors.white} />
      </Pressable>

      <VStack gap={5}>
        <View style={styles.brandHeader}>
          <BrandLogo />
          <Text variant="displaySm" align="center" style={styles.headerTitle}>Kayıt Ol</Text>
        </View>

        <RegisterForm f={f} />

        <HStack justify="center" wrap gap={1}>
          <Text variant="body" style={styles.footerText}>Zaten hesabınız var mı?</Text>
          <Text variant="body" weight="bold" style={styles.footerLink} onPress={() => router.push('/(auth)/login')}>
            Giriş Yap
          </Text>
        </HStack>
      </VStack>
    </Screen>
  );
}
