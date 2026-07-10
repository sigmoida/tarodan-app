import React from 'react';
import { View, Text, ScrollView, Platform, KeyboardAvoidingView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@tarodan/ui-native';

import { styles } from './_lib/styles';
import type { ListingFormProps } from './_lib/types';
import { useListingForm } from './_hooks/useListingForm';
import { ListingGates } from './_components/ListingGates';
import {
  ListingHeaderBanners,
  ListingImagesSection,
  ListingBasicInfoSection,
  ListingDetailsSection,
  ListingOptionsSection,
  ListingPricingSection,
  ListingSubmitRow,
} from './_components/ListingSections';
import { ListingPickers } from './_components/ListingPickers';

const { colors } = theme;

export type { ListingFormProps };

/**
 * Shared create/edit listing form. THIN screen: the `useListingForm` controller
 * owns all state/effects/mutations; this component only composes the gate,
 * sections, and picker modals. Consumed by `app/(tabs)/sell.tsx` (create) and
 * `app/listing/[id]/edit.tsx` (edit).
 */
export default function ListingForm({ mode, productId }: ListingFormProps) {
  const f = useListingForm({ mode, productId });

  const gate = ListingGates({ f });
  if (gate) return gate;

  return (
    <SafeAreaView style={styles.container} edges={f.isEdit ? ['bottom'] : ['top', 'bottom']}>
      {f.isEdit && (
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Geri">
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>İlanı Düzenle</Text>
          <View style={{ width: 24 }} />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ListingHeaderBanners f={f} />
          <ListingImagesSection f={f} />
          <ListingBasicInfoSection f={f} />
          <ListingDetailsSection f={f} />
          <ListingOptionsSection f={f} />
          <ListingPricingSection f={f} />
          <ListingSubmitRow f={f} />
        </ScrollView>
      </KeyboardAvoidingView>

      <ListingPickers f={f} />
    </SafeAreaView>
  );
}
