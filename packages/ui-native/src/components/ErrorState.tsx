import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { theme } from '../lib/theme';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  fullscreen?: boolean;
}

const { colors, spacing, radius } = theme;

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Bir şeyler ters gitti',
  message = 'İçerik yüklenemedi. Lütfen tekrar deneyin.',
  onRetry,
  retryLabel = 'Tekrar Dene',
  fullscreen = false,
}) => (
  <View style={[styles.container, fullscreen && styles.fullscreen]}>
    <View style={styles.iconCircle}>
      <Ionicons name="alert-circle-outline" size={44} color={colors.danger[600]!} />
    </View>
    <Text variant="h3" align="center">
      {title}
    </Text>
    <Text variant="bodySm" tone="muted" align="center" style={styles.message}>
      {message}
    </Text>
    {onRetry ? (
      <Button
        variant="primary"
        title={retryLabel}
        onPress={onRetry}
        style={styles.button}
      />
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[8],
  },
  fullscreen: { flex: 1 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.danger[50]!,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  message: { marginTop: spacing[2] },
  // Button varsayılan alignSelf:'flex-start' kullanır; ortalı içeriğe hizala.
  button: { marginTop: spacing[5], alignSelf: 'center' },
});
