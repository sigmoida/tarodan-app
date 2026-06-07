import { View, StyleSheet, Modal as RNModal, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Button } from '@tarodan/ui-native';

const { colors } = theme;

interface SignupPromptProps {
  visible: boolean;
  onDismiss: () => void;
  type: 'favorites' | 'message' | 'purchase' | 'trade' | 'collections';
}

const PROMPT_CONFIG = {
  favorites: {
    icon: 'heart',
    title: 'Favorilere Ekle',
    description: 'Beğendiğiniz ürünleri favorilere ekleyerek daha sonra kolayca bulabilirsiniz. Ücretsiz üye olun!',
    primaryButton: 'Üye Ol',
    primaryAction: () => router.push('/(auth)/register'),
    benefits: [
      'Sınırsız favori listesi',
      'Fiyat değişikliği bildirimleri',
      'Favori ürünlerinize hızlı erişim',
    ],
  },
  message: {
    icon: 'chatbubble-ellipses',
    title: 'Satıcıyla İletişim',
    description: 'Satıcılarla mesajlaşmak için üye girişi yapmanız gerekiyor. Sorularınızı sorun, pazarlık yapın!',
    primaryButton: 'Giriş Yap',
    primaryAction: () => router.push('/(auth)/login'),
    benefits: [
      'Satıcılarla direkt iletişim',
      'Pazarlık yapabilme',
      'Ürün hakkında soru sorma',
    ],
  },
  purchase: {
    icon: 'checkmark-circle',
    title: 'Siparişiniz Tamamlandı!',
    description: 'Siparişlerinizi kolayca takip etmek ve gelecek alışverişlerinizde avantajlar için üye olun.',
    primaryButton: 'Üye Ol',
    primaryAction: () => router.push('/(auth)/register'),
    benefits: [
      'Sipariş geçmişi',
      'Tek tıkla yeniden sipariş',
      'Özel indirimler',
    ],
  },
  trade: {
    icon: 'swap-horizontal',
    title: 'Takas Özelliği',
    description: 'Takas teklifleri göndermek ve almak için premium üye olmanız gerekiyor. Koleksiyonunuzu büyütün!',
    primaryButton: 'Premium Ol',
    primaryAction: () => router.push('/(auth)/register'),
    benefits: [
      'Takas teklifi gönderme',
      'Koleksiyon değişimi',
      'Güvenli takas garantisi',
    ],
  },
  collections: {
    icon: 'albums',
    title: 'Digital Garage',
    description: 'Kendi koleksiyonunuzu oluşturup sergilemek için premium üye olun. Diğer koleksiyonerlere ilham verin!',
    primaryButton: 'Premium Ol',
    primaryAction: () => router.push('/(auth)/register'),
    benefits: [
      'Sınırsız koleksiyon oluşturma',
      'Koleksiyonunuzu paylaşma',
      'Koleksiyoner rozetleri',
    ],
  },
};

export function SignupPrompt({ visible, onDismiss, type }: SignupPromptProps) {
  if (!visible) return null;

  const config = PROMPT_CONFIG[type];

  return (
    <RNModal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onDismiss}>
            <Ionicons name="close" size={24} color={colors.text.muted} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name={config.icon as any} size={48} color={colors.primary[600]!} />
          </View>

          {/* Title & Description */}
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.description}>{config.description}</Text>

          {/* Benefits */}
          <View style={styles.benefitsList}>
            {config.benefits.map((benefit, index) => (
              <View key={index} style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>

          {/* Buttons */}
          <Button
            variant="primary"
            title={config.primaryButton}
            onPress={() => {
              onDismiss();
              config.primaryAction();
            }}
            style={styles.primaryButton}
          />

          {type !== 'message' && (
            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => {
                onDismiss();
                router.push('/(auth)/login');
              }}
            >
              <Text style={styles.loginLinkText}>
                Zaten üye misiniz? <Text style={styles.loginLinkBold}>Giriş Yap</Text>
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onDismiss}>
            <Text style={styles.skipText}>Şimdilik Geç</Text>
          </TouchableOpacity>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay.black50,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.heading,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  benefitsList: {
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  benefitText: {
    fontSize: 14,
    color: colors.text.heading,
    flex: 1,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 12,
    marginBottom: 12,
  },
  loginLink: {
    marginBottom: 16,
  },
  loginLinkText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  loginLinkBold: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  skipText: {
    fontSize: 14,
    color: colors.text.muted,
  },
});

export default SignupPrompt;
