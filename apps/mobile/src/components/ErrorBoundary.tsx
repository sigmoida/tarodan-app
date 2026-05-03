import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../theme';
import { captureException } from '../services/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Uygulama içinde herhangi bir render-time crash'i yakalar:
 *   - React tree'sini beyaz ekrana bırakmaz, friendly bir "tekrar dene"
 *     ekranı gösterir.
 *   - Hatayı Sentry'ye gönderir (paketleme sonrası gerçekten gönderir;
 *     dev'de ve Expo Go'da no-op).
 *
 * Async/event-handler hataları React'in error boundary'sine düşmez —
 * onları yakalamak için manuel `captureException` çağrısı gerek.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    captureException(error, {
      level: 'error',
      tags: { boundary: 'app-root' },
      extra: { componentStack: errorInfo.componentStack ?? 'n/a' },
    });
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Ionicons name="warning-outline" size={64} color={TarodanColors.error} />
        <Text style={styles.title}>Bir şeyler ters gitti</Text>
        <Text style={styles.subtitle}>
          Beklenmedik bir hata oluştu. Bilgilendirildik.{'\n'}
          Tekrar denemek için aşağıya dokun.
        </Text>
        {__DEV__ && this.state.error && (
          <ScrollView style={styles.errorBox}>
            <Text style={styles.errorText}>
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack ?? ''}
            </Text>
          </ScrollView>
        )}
        <TouchableOpacity style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  errorBox: {
    maxHeight: 200,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#FEE',
    borderRadius: 8,
    width: '100%',
  },
  errorText: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: '#900',
  },
  button: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: TarodanColors.primary,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
