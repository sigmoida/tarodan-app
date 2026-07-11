import React from 'react';
import { View } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';

const { colors } = theme;

/** Adım göstergesi: Adres → Ödeme → Onay. */
export function CheckoutProgress({ step }: { step: number }) {
  return (
    <View style={styles.progressContainer}>
      {[1, 2, 3].map((s) => (
        <View key={s} style={styles.progressStep}>
          <View style={[styles.progressCircle, step >= s && styles.progressCircleActive]}>
            {step > s ? (
              <Ionicons name="checkmark" size={16} color={colors.white} />
            ) : (
              <Text style={[styles.progressNumber, step >= s && styles.progressNumberActive]}>{s}</Text>
            )}
          </View>
          <Text style={[styles.progressLabel, step >= s && styles.progressLabelActive]}>
            {s === 1 ? 'Adres' : s === 2 ? 'Ödeme' : 'Onay'}
          </Text>
          {s < 3 ? <View style={[styles.progressLine, step > s && styles.progressLineActive]} /> : null}
        </View>
      ))}
    </View>
  );
}
