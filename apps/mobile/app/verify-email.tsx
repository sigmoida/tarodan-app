import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@tarodan/ui-native';
import { TarodanColors } from '../src/theme';
import { api } from '../src/services/api';
import { useTranslation } from '../src/i18n';

type VerificationState = 'loading' | 'success' | 'error';

export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [state, setState] = useState<VerificationState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    verifyEmail();
  }, [token]);

  const verifyEmail = async () => {
    if (!token) {
      setState('error');
      setErrorMessage(t('mobile.tokenInvalid'));
      return;
    }

    setState('loading');
    setErrorMessage('');

    try {
      await api.post('/auth/verify-email', { token });
      setState('success');
    } catch (err: any) {
      setState('error');
      const msg = err?.response?.data?.message || t('mobile.verifyEmailFailed');
      setErrorMessage(msg);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.verifyEmailTitle')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <View style={styles.content}>
        {state === 'loading' && (
          <View style={styles.stateContainer}>
            <View style={styles.spinnerCircle}>
              <ActivityIndicator size="large" color={TarodanColors.primary} />
            </View>
            <Text style={styles.stateTitle}>{t('common.loading')}</Text>
            <Text style={styles.stateSubtitle}>{t('mobile.verifyEmailSent')}</Text>
          </View>
        )}

        {state === 'success' && (
          <View style={styles.stateContainer}>
            <View style={[styles.iconCircle, { backgroundColor: TarodanColors.success + '15' }]}>
              <Ionicons name="checkmark-circle" size={64} color={TarodanColors.success} />
            </View>
            <Text style={styles.stateTitle}>{t('mobile.verifyEmailSuccess')}</Text>
            <Text style={styles.stateSubtitle}>
              {t('mobile.verifyEmailSuccess')}
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace('/settings/edit-profile')}
            >
              <Ionicons name="person-outline" size={18} color={TarodanColors.textOnPrimary} />
              <Text style={styles.primaryButtonText}>{t('nav.profile')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.secondaryButtonText}>{t('nav.home')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'error' && (
          <View style={styles.stateContainer}>
            <View style={[styles.iconCircle, { backgroundColor: TarodanColors.error + '15' }]}>
              <Ionicons name="close-circle" size={64} color={TarodanColors.error} />
            </View>
            <Text style={styles.stateTitle}>{t('mobile.verifyEmailFailed')}</Text>
            <Text style={styles.stateSubtitle}>{errorMessage}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={verifyEmail}>
              <Ionicons name="refresh-outline" size={18} color={TarodanColors.textOnPrimary} />
              <Text style={styles.primaryButtonText}>{t('mobile.errorRetry')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => router.push('/help')}
            >
              <Ionicons name="help-circle-outline" size={18} color={TarodanColors.primary} />
              <Text style={styles.outlineButtonText}>{t('mobile.errorRetry')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.secondaryButtonText}>{t('nav.home')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  stateContainer: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  spinnerCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: TarodanColors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  stateSubtitle: {
    fontSize: 15,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: TarodanColors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  outlineButtonText: {
    color: TarodanColors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: TarodanColors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
