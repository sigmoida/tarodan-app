import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';

const { colors } = theme;

/** Takas koruma kartı — yalnızca aktif/erken statülerde. */
export function TradeProtectionCard({ status }: { status: string }) {
  if (!(status === 'pending' || status === 'accepted' || status === 'awaiting_payment')) return null;
  return (
    <Card style={styles.protectionCard}>
      <View style={styles.protectionContent}>
        <Ionicons name="shield-checkmark" size={24} color={colors.success[600]!} />
        <View style={styles.protectionTextContainer}>
          <Text variant="label">Takas Koruma Programı</Text>
          <Text variant="caption" style={styles.protectionDesc}>
            Her iki taraf da ürünü teslim alana kadar işlem güvence altındadır.
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  protectionCard: {
    margin: 16,
    marginTop: 0,
    backgroundColor: colors.success[50]!,
    borderWidth: 1,
    borderColor: colors.success[200]!,
  },
  protectionContent: { flexDirection: 'row', alignItems: 'center' },
  protectionTextContainer: { flex: 1, marginLeft: 12 },
  protectionDesc: { color: colors.text.muted, marginTop: 2 },
});
