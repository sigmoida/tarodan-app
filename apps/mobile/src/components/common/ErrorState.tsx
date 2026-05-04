import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../theme';
import { Text } from './PaperCompat';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  fullscreen?: boolean;
}

export function ErrorState({
  title = 'Bir şeyler ters gitti',
  message = 'İçerik yüklenemedi. Lütfen tekrar deneyin.',
  onRetry,
  retryLabel = 'Tekrar Dene',
  fullscreen = false,
}: ErrorStateProps) {
  return (
    <View style={[styles.container, fullscreen && styles.fullscreen]}>
      <View style={styles.iconCircle}>
        <Ionicons name="alert-circle-outline" size={44} color={TarodanColors.error} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Button
          mode="contained"
          buttonColor={TarodanColors.primary}
          onPress={onRetry}
          style={styles.button}
          icon="refresh"
        >
          {retryLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  fullscreen: {
    flex: 1,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: TarodanColors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  button: {
    marginTop: 20,
    borderRadius: 10,
  },
});

export default ErrorState;
