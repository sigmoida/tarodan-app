import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Controller } from 'react-hook-form';
import { router } from 'expo-router';
import { Alert as UIAlert, Button, HStack, Input, Text, theme } from '@tarodan/ui-native';

import { isGoogleConfigured } from '@/services/googleSignin';
import { styles } from '../_lib/styles';
import type { LoginController } from '../_hooks/useLogin';

const { colors } = theme;

/** The login form card: unverified banner, email/password, social buttons, guest. */
export function LoginCard({ f }: { f: LoginController }) {
  const { control, formState: { errors } } = f.form;

  return (
    <View style={styles.card}>
      <Text variant="h3" align="center">
        Tekrar hoş geldiniz
      </Text>
      <Text variant="bodySm" tone="muted" align="center" style={{ marginBottom: theme.spacing[4] }}>
        Hesabınıza giriş yapın
      </Text>

      {f.unverifiedEmail ? (
        <UIAlert variant="warning" title="E-posta doğrulanmadı" testID="unverified-email-banner">
          <Text variant="bodySm">
            <Text variant="bodySm" weight="bold">
              {f.unverifiedEmail}
            </Text>{' '}
            adresi henüz doğrulanmadı. Hesabınızı kullanmak için e-posta adresinize
            gönderilen bağlantıya tıklayın veya yeni bir bağlantı isteyin.
          </Text>
          <HStack gap={2} style={{ marginTop: theme.spacing[2] }}>
            <Button
              variant="outline"
              size="sm"
              title={f.resendVerificationMutation.isPending ? 'Gönderiliyor…' : 'Tekrar Gönder'}
              onPress={() => f.resendVerificationMutation.mutate()}
              disabled={f.resendVerificationMutation.isPending}
            />
            <Button variant="ghost" size="sm" title="Kapat" onPress={() => f.setUnverifiedEmail(null)} />
          </HStack>
        </UIAlert>
      ) : null}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <Input
            testID="login-email-input"
            label="E-posta"
            leftIconName="mail-outline"
            placeholder="ornek@eposta.com"
            value={value}
            onChangeText={onChange}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={errors.email?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <Input
            testID="login-password-input"
            label="Şifre"
            leftIconName="lock-closed-outline"
            placeholder="••••••••"
            value={value}
            onChangeText={onChange}
            // Maestro iOS secureTextEntry'ye inputText gönderemiyor;
            // EXPO_PUBLIC_MAESTRO=1 ile maskeyi kapat. Production: daima maskeli.
            secureTextEntry={process.env.EXPO_PUBLIC_MAESTRO !== '1'}
            togglePasswordVisibility
            autoComplete="password"
            error={errors.password?.message}
          />
        )}
      />

      <Pressable
        onPress={() => router.push('/(auth)/forgot-password' as never)}
        hitSlop={8}
        style={styles.forgotLink}
      >
        <Text variant="bodySm" tone="primary" weight="semibold">
          Şifremi Unuttum
        </Text>
      </Pressable>

      {f.errorBannerVisible ? (
        <Text
          testID="login-error-banner"
          variant="bodySm"
          tone="danger"
          align="center"
          style={{ marginBottom: theme.spacing[2] }}
        >
          {f.errorMessage || 'Giriş başarısız.'}
        </Text>
      ) : null}
      {process.env.EXPO_PUBLIC_MAESTRO === '1' && f.loginMutation.isError && !f.errorMessage ? (
        <Text testID="login-error-banner-fallback" style={{ height: 0, opacity: 0 }}>
          login-error
        </Text>
      ) : null}

      <Button
        testID="login-submit-button"
        variant="primary"
        size="lg"
        fullWidth
        title="Giriş Yap"
        onPress={f.handleLoginPress}
        isLoading={f.loginMutation.isPending}
        disabled={f.loginMutation.isPending}
      />

      {/* Ayraç */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text variant="caption" tone="muted">veya</Text>
        <View style={styles.dividerLine} />
      </View>

      {isGoogleConfigured() && (
        <Pressable
          testID="login-google-button"
          onPress={f.handleGoogle}
          accessibilityRole="button"
          accessibilityLabel="Google ile devam et"
          disabled={f.loginMutation.isPending || f.googleLoading}
          style={[styles.googleButton, (f.loginMutation.isPending || f.googleLoading) && { opacity: 0.6 }]}
        >
          {f.googleLoading ? (
            <ActivityIndicator size="small" color={colors.text.heading} />
          ) : (
            <Ionicons name="logo-google" size={18} color={colors.text.heading} />
          )}
          <Text variant="body" weight="semibold">
            {f.googleLoading ? 'Giriş yapılıyor…' : 'Google ile devam et'}
          </Text>
        </Pressable>
      )}

      {f.appleAvailable && (
        <Pressable
          testID="login-apple-button"
          onPress={f.handleApple}
          accessibilityRole="button"
          accessibilityLabel="Apple ile devam et"
          disabled={f.loginMutation.isPending || f.appleLoading}
          style={[styles.appleButton, (f.loginMutation.isPending || f.appleLoading) && { opacity: 0.6 }]}
        >
          {f.appleLoading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="logo-apple" size={18} color={colors.white} />
          )}
          <Text variant="body" weight="semibold" style={styles.appleButtonText}>
            {f.appleLoading ? 'Giriş yapılıyor…' : 'Apple ile devam et'}
          </Text>
        </Pressable>
      )}

      <Button
        testID="continue-as-guest-button"
        variant="outline"
        size="lg"
        fullWidth
        title="Misafir Olarak Devam Et"
        onPress={f.continueAsGuest}
        disabled={f.loginMutation.isPending}
        style={{ marginTop: theme.spacing[3] }}
      />
    </View>
  );
}
