import { View, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Input, Button, ScreenHeader } from '@tarodan/ui-native';

import { styles } from './_lib/styles';
import { useOrderTrack } from './_hooks/useOrderTrack';
import { OrderTrackResult } from './_components/OrderTrackResult';

const { colors } = theme;

/**
 * Guest order tracking — THIN screen. The `useOrderTrack` controller owns the
 * form state, validation, and guest track POST; this file composes the form,
 * the result card, and the help footer.
 */
export default function OrderTrackScreen() {
  const f = useOrderTrack();

  return (
    <View style={styles.container}>
      <ScreenHeader title="Sipariş Takip" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Track Form */}
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <Ionicons name="search-outline" size={24} color={colors.primary[600]!} />
            <Text style={styles.formTitle}>Siparişinizi Sorgulayın</Text>
          </View>

          <Text style={styles.formDescription}>
            Sipariş numaranız ve e-posta adresinizle siparişinizin durumunu öğrenebilirsiniz.
          </Text>

          <Input
            label="Sipariş Numarası"
            value={f.orderNumber}
            onChangeText={f.onChangeOrderNumber}
            containerStyle={styles.input}
            placeholder="ORD-XXXXXX"
            autoCapitalize="characters"
          />

          <Input
            label="E-posta Adresi"
            value={f.email}
            onChangeText={f.onChangeEmail}
            containerStyle={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="ornek@email.com"
          />

          {f.error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.danger[600]!} />
              <Text style={styles.errorText}>{f.error}</Text>
            </View>
          ) : null}

          <Button
            variant="primary"
            title="Sipariş Sorgula"
            onPress={f.handleTrack}
            isLoading={f.loading}
            disabled={f.loading}
            style={styles.trackButton}
            icon="search"
          />
        </View>

        {/* Order Result */}
        {f.order && <OrderTrackResult order={f.order} />}

        {/* Help Section */}
        <View style={styles.helpSection}>
          <Ionicons name="help-circle-outline" size={24} color={colors.primary[600]!} />
          <View style={styles.helpContent}>
            <Text style={styles.helpTitle}>Yardım mı gerekiyor?</Text>
            <Text style={styles.helpText}>
              Siparişinizle ilgili sorunuz varsa destek ekibimizle iletişime geçebilirsiniz.
            </Text>
            <TouchableOpacity style={styles.helpButton} onPress={() => router.push('/help')}>
              <Text style={styles.helpButtonText}>Destek Al</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary[600]!} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
