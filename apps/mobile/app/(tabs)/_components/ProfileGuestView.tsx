import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Snackbar, Text, theme } from '@tarodan/ui-native';

import { SignupPrompt } from '../../../src/components/SignupPrompt';
import { styles } from '../_lib/profileStyles';
import { benefitTints } from '../_lib/profileConstants';
import type { ProfileController } from '../_hooks/useProfile';

const { colors, spacing, radius } = theme;

/** Unauthenticated profile: welcome, benefits, quick links, premium promo. */
export function ProfileGuestView({ f }: { f: ProfileController }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="h3" tone="inverted" weight="bold">
          Profil
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.guestWelcome}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: radius.full,
              backgroundColor: colors.primary[50]!,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="person-outline" size={48} color={colors.primary[600]!} />
          </View>
          <Text variant="h1" align="center" style={{ marginTop: spacing[4] }}>
            Hoş Geldiniz!
          </Text>
          <Text
            variant="body"
            tone="muted"
            align="center"
            style={{ marginTop: spacing[2], marginBottom: spacing[5] }}
          >
            Tarodan'a giriş yaparak tüm özelliklerden yararlanın
          </Text>
          <Button
            testID="profile-go-login-button"
            variant="primary"
            size="lg"
            fullWidth
            icon="log-in-outline"
            title="Giriş Yap"
            onPress={() => router.push('/(auth)/login')}
            style={styles.loginButton}
          />
          <Button
            variant="outline"
            size="lg"
            fullWidth
            title="Ücretsiz Üye Ol"
            onPress={() => router.push('/(auth)/register')}
            style={styles.registerButton}
          />
        </View>

        <View style={styles.benefitsSection}>
          <Text variant="h3" style={{ marginBottom: spacing[4] }}>
            Üye Olarak Neler Yapabilirsiniz?
          </Text>

          {[
            {
              icon: 'pricetag' as const,
              title: 'İlan Yayınlayın',
              desc: 'Koleksiyonunuzdaki modelleri satışa çıkarın veya takasa açın',
              tint: benefitTints[0],
            },
            {
              icon: 'swap-horizontal' as const,
              title: 'Takas Yapın',
              desc: 'Diğer koleksiyonerlerle model değişimi yapın',
              tint: benefitTints[1],
            },
            {
              icon: 'heart' as const,
              title: 'Favorilere Kaydedin',
              desc: 'Beğendiğiniz ürünleri kaydedin, fiyat değişikliklerinden haberdar olun',
              tint: benefitTints[2],
            },
            {
              icon: 'car-sport' as const,
              title: 'Digital Garage',
              desc: 'Koleksiyonunuzu sergileyin ve diğerleriyle paylaşın',
              tint: benefitTints[3],
            },
          ].map((b) => (
            <View key={b.title} style={styles.benefitCard}>
              <View style={[styles.benefitIcon, { backgroundColor: b.tint.bg }]}>
                <Ionicons name={b.icon} size={24} color={b.tint.fg} />
              </View>
              <View style={styles.benefitContent}>
                <Text variant="label">{b.title}</Text>
                <Text variant="bodySm" tone="muted" style={{ marginTop: spacing[1] }}>
                  {b.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.quickLinksSection}>
          <Text variant="label" tone="muted" style={{ marginBottom: spacing[3] }}>
            Şimdilik Şunları Yapabilirsiniz
          </Text>

          {[
            { icon: 'search-outline' as const, label: 'İlanlara Göz At', to: '/search' },
            { icon: 'albums-outline' as const, label: 'Koleksiyonları Keşfet', to: '/collections' },
            { icon: 'cart-outline' as const, label: 'Sepetim', to: '/cart' },
            { icon: 'location-outline' as const, label: 'Sipariş Takip', to: '/order-track' },
            { icon: 'help-circle-outline' as const, label: 'Yardım Merkezi', to: '/help' },
          ].map((q) => (
            <TouchableOpacity
              key={q.label}
              style={styles.quickLinkItem}
              onPress={() => router.push(q.to as never)}
            >
              <Ionicons name={q.icon} size={22} color={colors.primary[600]!} />
              <Text variant="body" style={styles.quickLinkText}>
                {q.label}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.text.subtle} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.premiumPromo}>
          <View style={styles.premiumHeader}>
            <Ionicons name="diamond" size={32} color={colors.warning[500]!} />
            <Text variant="h2" tone="inverted" style={{ marginLeft: spacing[3] }}>
              Premium Üyelik
            </Text>
          </View>
          <Text
            variant="body"
            color={colors.white}
            style={{ marginBottom: spacing[4], opacity: 0.85 }}
          >
            Sınırsız ilan, takas özelliği, Digital Garage ve daha fazlası için Premium üye olun!
          </Text>
          <View style={styles.premiumPrice}>
            <Text variant="bodySm" color={colors.white} style={{ opacity: 0.7, marginRight: spacing[2] }}>
              Aylık sadece
            </Text>
            <Text variant="displaySm" color={colors.warning[500]!} weight="bold">
              ₺99
            </Text>
          </View>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            title="Premium Ol"
            onPress={() => router.push('/(auth)/register')}
            style={{ backgroundColor: colors.warning[500]! }}
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Snackbar
        visible={f.snackbarVisible}
        onDismiss={() => f.setSnackbarVisible(false)}
        duration={2000}
      >
        {f.snackbarMessage}
      </Snackbar>

      <SignupPrompt
        visible={f.showPrompt}
        onDismiss={() => f.setShowPrompt(false)}
        type={f.promptType}
      />
    </View>
  );
}
