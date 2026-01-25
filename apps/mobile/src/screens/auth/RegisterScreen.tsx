/**
 * Register Screen
 */

import React, { useState } from 'react';
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
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../stores/authStore';

const RegisterScreen = ({ navigation }: any) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [notificationConsent, setNotificationConsent] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { register, isLoading, error } = useAuthStore();

  // Calculate if user is 18+
  const isAdult = (date: Date): boolean => {
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      age--;
    }
    
    return age >= 18;
  };

  const formatDate = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setBirthDate(selectedDate);
      setErrorMessage(null);
    }
  };

  const handleRegister = async () => {
    setErrorMessage(null);
    
    if (!username.trim() || !email.trim() || !password.trim()) {
      setErrorMessage('Tüm alanları doldurun');
      return;
    }

    if (!birthDate) {
      setErrorMessage('Doğum tarihi zorunludur');
      return;
    }

    if (!isAdult(birthDate)) {
      setErrorMessage('Kayıt olmak için en az 18 yaşında olmanız gerekmektedir');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Şifreler eşleşmiyor');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Şifre en az 8 karakter olmalıdır');
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      setErrorMessage('Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir');
      return;
    }

    if (!agreeTerms) {
      setErrorMessage('Kullanım şartlarını kabul etmelisiniz');
      return;
    }

    try {
      await register(username, email, password, {
        birthDate: birthDate.toISOString().split('T')[0],
        marketingConsent,
        notificationConsent,
      });
      Alert.alert(
        'Kayıt Başarılı!', 
        'Lütfen email adresinize gönderilen doğrulama linkine tıklayın.',
        [{ text: 'Tamam' }]
      );
    } catch (e: any) {
      setErrorMessage(e.message || error || 'Lütfen bilgilerinizi kontrol edin');
    }
  };

  // Maximum date is 18 years ago
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - 18);

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" size={24} color="#212121" />
          </TouchableOpacity>
          <Text style={styles.title}>Hesap Oluştur</Text>
          <Text style={styles.subtitle}>Koleksiyonerlere katılın</Text>
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
          <View style={styles.inputContainer}>
            <Icon name="person-outline" size={22} color="#757575" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Kullanıcı Adı"
              placeholderTextColor="#9E9E9E"
              value={username}
              onChangeText={(text) => { setUsername(text); setErrorMessage(null); }}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Icon name="mail-outline" size={22} color="#757575" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="E-posta"
              placeholderTextColor="#9E9E9E"
              value={email}
              onChangeText={(text) => { setEmail(text); setErrorMessage(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Birth Date Picker */}
          <TouchableOpacity 
            style={styles.inputContainer}
            onPress={() => setShowDatePicker(true)}
          >
            <Icon name="calendar-outline" size={22} color="#757575" style={styles.inputIcon} />
            <Text style={[styles.input, !birthDate && styles.placeholderText]}>
              {birthDate ? formatDate(birthDate) : 'Doğum Tarihi (18+ zorunlu)'}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={birthDate || maxDate}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              maximumDate={maxDate}
              minimumDate={new Date(1900, 0, 1)}
            />
          )}

          <View style={styles.inputContainer}>
            <Icon name="lock-closed-outline" size={22} color="#757575" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Şifre"
              placeholderTextColor="#9E9E9E"
              value={password}
              onChangeText={(text) => { setPassword(text); setErrorMessage(null); }}
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

          <View style={styles.inputContainer}>
            <Icon name="lock-closed-outline" size={22} color="#757575" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Şifre Tekrar"
              placeholderTextColor="#9E9E9E"
              value={confirmPassword}
              onChangeText={(text) => { setConfirmPassword(text); setErrorMessage(null); }}
              secureTextEntry={!showPassword}
            />
          </View>

          {/* Terms Checkbox */}
          <TouchableOpacity 
            style={styles.checkboxContainer}
            onPress={() => setAgreeTerms(!agreeTerms)}
          >
            <View style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}>
              {agreeTerms && <Icon name="checkmark" size={16} color="#FFF" />}
            </View>
            <Text style={styles.checkboxText}>
              <Text style={styles.linkText}>Kullanım Şartları</Text> ve{' '}
              <Text style={styles.linkText}>Gizlilik Politikası</Text>'nı kabul ediyorum
            </Text>
          </TouchableOpacity>

          {/* Marketing Consent */}
          <TouchableOpacity 
            style={styles.checkboxContainer}
            onPress={() => setMarketingConsent(!marketingConsent)}
          >
            <View style={[styles.checkbox, marketingConsent && styles.checkboxChecked]}>
              {marketingConsent && <Icon name="checkmark" size={16} color="#FFF" />}
            </View>
            <Text style={styles.checkboxText}>
              Kampanya ve promosyon emaillerini almak istiyorum
            </Text>
          </TouchableOpacity>

          {/* Notification Consent */}
          <TouchableOpacity 
            style={styles.checkboxContainer}
            onPress={() => setNotificationConsent(!notificationConsent)}
          >
            <View style={[styles.checkbox, notificationConsent && styles.checkboxChecked]}>
              {notificationConsent && <Icon name="checkmark" size={16} color="#FFF" />}
            </View>
            <Text style={styles.checkboxText}>
              Bildirim almak istiyorum (sipariş, mesaj vb.)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.registerButtonText}>Kayıt Ol</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Login Link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Zaten hesabınız var mı?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Giriş Yapın</Text>
          </TouchableOpacity>
        </View>
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
    padding: 24,
  },
  header: {
    marginBottom: 32,
    marginTop: 48,
  },
  backButton: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#212121',
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
    minHeight: 52,
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
  placeholderText: {
    color: '#9E9E9E',
  },
  eyeIcon: {
    padding: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#E53935',
    borderColor: '#E53935',
  },
  checkboxText: {
    flex: 1,
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
  },
  linkText: {
    color: '#E53935',
    fontWeight: '500',
  },
  registerButton: {
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
    marginTop: 8,
  },
  registerButtonDisabled: {
    opacity: 0.7,
  },
  registerButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: '#757575',
    fontSize: 14,
  },
  loginLink: {
    color: '#E53935',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
});

export default RegisterScreen;


