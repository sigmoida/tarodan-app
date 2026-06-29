import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Button, Card, Snackbar, Text, Input, Textarea, ScreenHeader } from '@tarodan/ui-native';
import { supportApi } from '../src/services/api';
import { useTranslation } from '../src/i18n';
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_WHATSAPP } from '../src/constants/legalFacts';

const { colors } = theme;

export default function ContactScreen() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const handleSubmit = async () => {
    if (!name || !email || !subject || !message) {
      setSnackbar({ visible: true, message: 'Lütfen tüm alanları doldurun' });
      return;
    }
    // Backend DTO ile parite (GuestContactDto): name @MinLength(2), message @MinLength(10).
    if (name.trim().length < 2) {
      setSnackbar({ visible: true, message: 'Adınız en az 2 karakter olmalıdır.' });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setSnackbar({ visible: true, message: 'Geçerli bir e-posta adresi girin.' });
      return;
    }
    if (message.trim().length < 10) {
      setSnackbar({ visible: true, message: 'Mesaj en az 10 karakter olmalıdır.' });
      return;
    }

    setLoading(true);
    try {
      await supportApi.guestContact({ name, email, subject, message });
      setSnackbar({ visible: true, message: 'Mesajınız gönderildi!' });
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch {
      setSnackbar({ visible: true, message: 'Mesaj gönderilemedi, lütfen tekrar deneyin.' });
    } finally {
      setLoading(false);
    }
  };

  const contactMethods = [
    {
      icon: 'mail-outline',
      title: 'E-posta',
      value: SUPPORT_EMAIL,
      action: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`),
    },
    {
      icon: 'call-outline',
      title: 'Telefon',
      value: SUPPORT_PHONE,
      action: () => Linking.openURL('tel:+902121234567'),
    },
    {
      icon: 'logo-whatsapp',
      title: 'WhatsApp',
      value: SUPPORT_WHATSAPP,
      action: () => Linking.openURL('https://wa.me/905321234567'),
    },
    {
      icon: 'location-outline',
      title: 'Adres',
      value: 'İstanbul, Türkiye',
      action: () => {},
    },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pageContact')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Contact Methods */}
        <Text style={styles.sectionTitle}>Bize Ulaşın</Text>
        <View style={styles.contactMethods}>
          {contactMethods.map((method, index) => (
            <TouchableOpacity
              key={index}
              style={styles.contactMethod}
              onPress={method.action}
            >
              <View style={styles.contactMethodIcon}>
                <Ionicons name={method.icon as any} size={24} color={colors.primary[600]!} />
              </View>
              <View style={styles.contactMethodContent}>
                <Text style={styles.contactMethodTitle}>{method.title}</Text>
                <Text style={styles.contactMethodValue}>{method.value}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.subtle} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Contact Form */}
        <Text style={styles.sectionTitle}>Mesaj Gönderin</Text>
        <Card style={styles.formCard}>
          <Input
            label="Adınız"
            value={name}
            onChangeText={setName}
            style={styles.input}
          />
          <Input
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Konu"
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
          />
          <Textarea
            label="Mesajınız"
            value={message}
            onChangeText={setMessage}
            style={styles.input}
            rows={5}
          />
          <Button
            variant="primary"
            title="Gönder"
            onPress={handleSubmit}
            isLoading={loading}
            disabled={loading}
            style={styles.submitButton}
          />
        </Card>

        {/* Working Hours */}
        <Text style={styles.sectionTitle}>Çalışma Saatleri</Text>
        <Card style={styles.hoursCard}>
          <View style={styles.hoursRow}>
            <Text style={styles.hoursDay}>Pazartesi - Cuma</Text>
            <Text style={styles.hoursTime}>09:00 - 18:00</Text>
          </View>
          <View style={styles.hoursRow}>
            <Text style={styles.hoursDay}>Cumartesi</Text>
            <Text style={styles.hoursTime}>10:00 - 14:00</Text>
          </View>
          <View style={styles.hoursRow}>
            <Text style={styles.hoursDay}>Pazar</Text>
            <Text style={styles.hoursClosed}>Kapalı</Text>
          </View>
        </Card>

        {/* FAQ Link */}
        <TouchableOpacity style={styles.faqLink} onPress={() => router.push('/help')}>
          <Ionicons name="help-circle-outline" size={24} color={colors.primary[600]!} />
          <Text style={styles.faqLinkText}>Sık Sorulan Sorular</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.primary[600]!} />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
    marginTop: 8,
  },
  contactMethods: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    marginBottom: 24,
  },
  contactMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  contactMethodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactMethodContent: {
    flex: 1,
    marginLeft: 16,
  },
  contactMethodTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  contactMethodValue: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 2,
  },
  formCard: {
    backgroundColor: colors.surface.DEFAULT,
    marginBottom: 24,
  },
  input: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  submitButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  hoursCard: {
    backgroundColor: colors.surface.DEFAULT,
    marginBottom: 24,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hoursDay: {
    fontSize: 14,
    color: colors.text.heading,
  },
  hoursTime: {
    fontSize: 14,
    color: colors.success[600]!,
    fontWeight: '500',
  },
  hoursClosed: {
    fontSize: 14,
    color: colors.danger[600]!,
    fontWeight: '500',
  },
  faqLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    borderRadius: 12,
  },
  faqLinkText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
