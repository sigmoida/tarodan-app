import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Text, TextInput, Button, Card, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';

export default function ContactScreen() {
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

    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLoading(false);
    
    setSnackbar({ visible: true, message: 'Mesajınız gönderildi!' });
    setName('');
    setEmail('');
    setSubject('');
    setMessage('');
  };

  const contactMethods = [
    {
      icon: 'mail-outline',
      title: 'E-posta',
      value: 'destek@tarodan.com',
      action: () => Linking.openURL('mailto:destek@tarodan.com'),
    },
    {
      icon: 'call-outline',
      title: 'Telefon',
      value: '+90 212 XXX XX XX',
      action: () => Linking.openURL('tel:+902121234567'),
    },
    {
      icon: 'logo-whatsapp',
      title: 'WhatsApp',
      value: '+90 532 XXX XX XX',
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>İletişim</Text>
        <View style={{ width: 24 }} />
      </View>

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
                <Ionicons name={method.icon as any} size={24} color={TarodanColors.primary} />
              </View>
              <View style={styles.contactMethodContent}>
                <Text style={styles.contactMethodTitle}>{method.title}</Text>
                <Text style={styles.contactMethodValue}>{method.value}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textLight} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Contact Form */}
        <Text style={styles.sectionTitle}>Mesaj Gönderin</Text>
        <Card style={styles.formCard}>
          <Card.Content>
            <TextInput
              label="Adınız"
              value={name}
              onChangeText={setName}
              mode="outlined"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="E-posta"
              value={email}
              onChangeText={setEmail}
              mode="outlined"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="Konu"
              value={subject}
              onChangeText={setSubject}
              mode="outlined"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="Mesajınız"
              value={message}
              onChangeText={setMessage}
              mode="outlined"
              style={styles.input}
              multiline
              numberOfLines={5}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              style={styles.submitButton}
              buttonColor={TarodanColors.primary}
            >
              Gönder
            </Button>
          </Card.Content>
        </Card>

        {/* Working Hours */}
        <Text style={styles.sectionTitle}>Çalışma Saatleri</Text>
        <Card style={styles.hoursCard}>
          <Card.Content>
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
          </Card.Content>
        </Card>

        {/* FAQ Link */}
        <TouchableOpacity style={styles.faqLink} onPress={() => router.push('/help')}>
          <Ionicons name="help-circle-outline" size={24} color={TarodanColors.primary} />
          <Text style={styles.faqLinkText}>Sık Sorulan Sorular</Text>
          <Ionicons name="chevron-forward" size={20} color={TarodanColors.primary} />
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 12,
    marginTop: 8,
  },
  contactMethods: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    marginBottom: 24,
  },
  contactMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  contactMethodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: TarodanColors.primaryLight,
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
    color: TarodanColors.textPrimary,
  },
  contactMethodValue: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  formCard: {
    backgroundColor: TarodanColors.background,
    marginBottom: 24,
  },
  input: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  submitButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  hoursCard: {
    backgroundColor: TarodanColors.background,
    marginBottom: 24,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  hoursDay: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  hoursTime: {
    fontSize: 14,
    color: TarodanColors.success,
    fontWeight: '500',
  },
  hoursClosed: {
    fontSize: 14,
    color: TarodanColors.error,
    fontWeight: '500',
  },
  faqLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    padding: 16,
    borderRadius: 12,
  },
  faqLinkText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: TarodanColors.primary,
    fontWeight: '500',
  },
});
