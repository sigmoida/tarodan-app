import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const validatePassword = () => {
    if (password.length < 8) {
      return 'Şifre en az 8 karakter olmalıdır';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Şifre en az bir büyük harf içermelidir';
    }
    if (!/[a-z]/.test(password)) {
      return 'Şifre en az bir küçük harf içermelidir';
    }
    if (!/[0-9]/.test(password)) {
      return 'Şifre en az bir rakam içermelidir';
    }
    return null;
  };

  const handleResetPassword = async () => {
    setError('');

    // Validate token
    if (!token) {
      setError('Geçersiz veya eksik token. Lütfen şifre sıfırlama bağlantısını tekrar kullanın.');
      return;
    }

    // Validate password
    const passwordError = validatePassword();
    if (passwordError) {
      setError(passwordError);
      return;
    }

    // Check passwords match
    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword: password });
      setSuccess(true);
    } catch (err: any) {
      const message = err.response?.data?.message || 'Şifre sıfırlama başarısız oldu';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color={TarodanColors.success} />
          </View>
          <Text style={styles.successTitle}>Şifre Başarıyla Değiştirildi!</Text>
          <Text style={styles.successDescription}>
            Yeni şifreniz ile giriş yapabilirsiniz.
          </Text>
          <Button
            mode="contained"
            onPress={() => router.replace('/(auth)/login')}
            style={styles.loginButton}
            buttonColor={TarodanColors.primary}
          >
            Giriş Yap
          </Button>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="lock-closed-outline" size={48} color={TarodanColors.primary} />
          </View>

          <Text style={styles.title}>Yeni Şifre Belirle</Text>
          <Text style={styles.description}>
            Hesabınız için güçlü bir şifre oluşturun.
          </Text>

          {/* Password Input */}
          <TextInput
            label="Yeni Şifre"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            mode="outlined"
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
            right={
              <TextInput.Icon 
                icon={showPassword ? 'eye-off' : 'eye'} 
                onPress={() => setShowPassword(!showPassword)}
              />
            }
          />

          {/* Password Requirements */}
          <View style={styles.requirements}>
            <Text style={styles.requirementsTitle}>Şifre gereksinimleri:</Text>
            <View style={styles.requirementItem}>
              <Ionicons 
                name={password.length >= 8 ? 'checkmark-circle' : 'ellipse-outline'} 
                size={16} 
                color={password.length >= 8 ? TarodanColors.success : TarodanColors.textLight} 
              />
              <Text style={[styles.requirementText, password.length >= 8 && styles.requirementMet]}>
                En az 8 karakter
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Ionicons 
                name={/[A-Z]/.test(password) ? 'checkmark-circle' : 'ellipse-outline'} 
                size={16} 
                color={/[A-Z]/.test(password) ? TarodanColors.success : TarodanColors.textLight} 
              />
              <Text style={[styles.requirementText, /[A-Z]/.test(password) && styles.requirementMet]}>
                En az bir büyük harf
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Ionicons 
                name={/[a-z]/.test(password) ? 'checkmark-circle' : 'ellipse-outline'} 
                size={16} 
                color={/[a-z]/.test(password) ? TarodanColors.success : TarodanColors.textLight} 
              />
              <Text style={[styles.requirementText, /[a-z]/.test(password) && styles.requirementMet]}>
                En az bir küçük harf
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Ionicons 
                name={/[0-9]/.test(password) ? 'checkmark-circle' : 'ellipse-outline'} 
                size={16} 
                color={/[0-9]/.test(password) ? TarodanColors.success : TarodanColors.textLight} 
              />
              <Text style={[styles.requirementText, /[0-9]/.test(password) && styles.requirementMet]}>
                En az bir rakam
              </Text>
            </View>
          </View>

          {/* Confirm Password Input */}
          <TextInput
            label="Şifre Tekrar"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            mode="outlined"
            style={styles.input}
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
            right={
              <TextInput.Icon 
                icon={showConfirmPassword ? 'eye-off' : 'eye'} 
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              />
            }
          />

          {/* Password Match Indicator */}
          {confirmPassword && (
            <View style={styles.matchIndicator}>
              <Ionicons 
                name={password === confirmPassword ? 'checkmark-circle' : 'close-circle'} 
                size={16} 
                color={password === confirmPassword ? TarodanColors.success : TarodanColors.error} 
              />
              <Text style={[
                styles.matchText,
                { color: password === confirmPassword ? TarodanColors.success : TarodanColors.error }
              ]}>
                {password === confirmPassword ? 'Şifreler eşleşiyor' : 'Şifreler eşleşmiyor'}
              </Text>
            </View>
          )}

          {/* Error Message */}
          {error ? (
            <HelperText type="error" visible={true} style={styles.errorText}>
              {error}
            </HelperText>
          ) : null}

          {/* Submit Button */}
          <Button
            mode="contained"
            onPress={handleResetPassword}
            loading={loading}
            disabled={loading || !password || !confirmPassword}
            style={styles.submitButton}
            buttonColor={TarodanColors.primary}
          >
            Şifreyi Değiştir
          </Button>

          {/* Back to Login */}
          <TouchableOpacity 
            style={styles.backToLogin}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Ionicons name="arrow-back" size={16} color={TarodanColors.primary} />
            <Text style={styles.backToLoginText}>Giriş sayfasına dön</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  input: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
  },
  requirements: {
    backgroundColor: TarodanColors.surfaceVariant,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  requirementsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
    marginBottom: 12,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  requirementText: {
    marginLeft: 8,
    fontSize: 13,
    color: TarodanColors.textLight,
  },
  requirementMet: {
    color: TarodanColors.success,
  },
  matchIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  matchText: {
    marginLeft: 8,
    fontSize: 13,
  },
  errorText: {
    marginBottom: 16,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
  backToLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  backToLoginText: {
    marginLeft: 8,
    fontSize: 14,
    color: TarodanColors.primary,
    fontWeight: '500',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  successDescription: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  loginButton: {
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 200,
  },
});
