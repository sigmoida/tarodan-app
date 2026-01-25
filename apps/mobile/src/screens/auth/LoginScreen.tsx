/**
 * Login Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAuthStore } from '../../stores/authStore';

const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { login, isLoading, error, clearError } = useAuthStore();

  // Clear error when inputs change
  useEffect(() => {
    if (errorMessage) {
      setErrorMessage(null);
    }
  }, [email, password]);

  const handleLogin = async () => {
    setErrorMessage(null);
    
    if (!email.trim() || !password.trim()) {
      setErrorMessage('E-posta ve şifre alanları zorunludur');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrorMessage('Geçerli bir e-posta adresi girin');
      return;
    }

    try {
      await login(email, password);
    } catch (e: any) {
      // Show inline error instead of alert
      const message = e.response?.data?.message || e.message || error || 'E-posta veya şifre hatalı';
      setErrorMessage(message);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo & Header */}
        <View style={styles.header}>
          <Icon name="car-sport" size={80} color="#E53935" />
          <Text style={styles.title}>Diecast Market</Text>
          <Text style={styles.subtitle}>Koleksiyoner Pazarı</Text>
        </View>

        {/* Error Message */}
        {errorMessage && (
          <View style={styles.errorContainer}>
            <Icon name="alert-circle" size={20} color="#D32F2F" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          <View style={[styles.inputContainer, errorMessage && styles.inputContainerError]}>
            <Icon name="mail-outline" size={22} color={errorMessage ? "#D32F2F" : "#757575"} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="E-posta"
              placeholderTextColor="#9E9E9E"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.inputContainer, errorMessage && styles.inputContainerError]}>
            <Icon name="lock-closed-outline" size={22} color={errorMessage ? "#D32F2F" : "#757575"} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Şifre"
              placeholderTextColor="#9E9E9E"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity 
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
            >
              <Icon 
                name={showPassword ? 'eye-off-outline' : 'eye-outline'} 
                size={22} 
                color="#757575" 
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotPassword}
          >
            <Text style={styles.forgotPasswordText}>Şifremi Unuttum</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.loginButtonText}>Giriş Yap</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Register Link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Hesabınız yok mu?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerLink}>Kayıt Olun</Text>
          </TouchableOpacity>
        </View>

        {/* Guest Continue */}
        <TouchableOpacity 
          style={styles.guestButton}
          onPress={() => {/* Navigate as guest */}}
        >
          <Text style={styles.guestButtonText}>Misafir olarak devam et</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#212121',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  form: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inputContainerError: {
    borderColor: '#FFCDD2',
    backgroundColor: '#FFF8F8',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    color: '#212121',
  },
  eyeIcon: {
    padding: 8,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: '#E53935',
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: '#E53935',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  footerText: {
    color: '#757575',
    fontSize: 14,
  },
  registerLink: {
    color: '#E53935',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  guestButton: {
    alignItems: 'center',
    padding: 12,
  },
  guestButtonText: {
    color: '#757575',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;


