import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card, Chip, Snackbar, Input, Textarea, Button } from '@tarodan/ui-native';
import { useAuthStore } from '../src/stores/authStore';
import { useTranslation } from '../src/i18n';

const { colors } = theme;

const SUPPORT_CATEGORIES = [
  { id: 'order', name: 'Sipariş Sorunu', icon: 'cube-outline' },
  { id: 'payment', name: 'Ödeme Sorunu', icon: 'card-outline' },
  { id: 'account', name: 'Hesap Sorunu', icon: 'person-outline' },
  { id: 'listing', name: 'İlan Sorunu', icon: 'pricetag-outline' },
  { id: 'trade', name: 'Takas Sorunu', icon: 'swap-horizontal' },
  { id: 'other', name: 'Diğer', icon: 'ellipsis-horizontal' },
];

const PRIORITY_OPTIONS = [
  { id: 'low', name: 'Düşük', color: colors.success[600]! },
  { id: 'medium', name: 'Orta', color: colors.warning[600]! },
  { id: 'high', name: 'Yüksek', color: colors.danger[600]! },
];

export default function SupportScreen() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const handleSubmit = async () => {
    if (!category || !subject || !description) {
      setSnackbar({ visible: true, message: 'Lütfen gerekli alanları doldurun' });
      return;
    }

    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLoading(false);

    setSnackbar({ visible: true, message: 'Destek talebiniz oluşturuldu!' });

    // Reset form
    setCategory('');
    setSubject('');
    setDescription('');
    setOrderId('');
    setPriority('medium');
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('mobile.pageSupport')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.authRequired}>
          <Ionicons name="headset-outline" size={64} color={colors.primary[600]!} />
          <Text style={styles.authTitle}>Giriş Gerekli</Text>
          <Text style={styles.authSubtitle}>
            Destek talebi oluşturmak için giriş yapmanız gerekmektedir.
          </Text>
          <Button
            variant="primary"
            title="Giriş Yap"
            onPress={() => router.push('/(auth)/login')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Destek Talebi</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Category Selection */}
        <Text style={styles.sectionTitle}>Kategori Seçin</Text>
        <View style={styles.categoriesGrid}>
          {SUPPORT_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryItem,
                category === cat.id && styles.categoryItemActive,
              ]}
              onPress={() => setCategory(cat.id)}
            >
              <Ionicons
                name={cat.icon as any}
                size={24}
                color={category === cat.id ? colors.primary[600]! : colors.text.muted}
              />
              <Text style={[
                styles.categoryItemText,
                category === cat.id && styles.categoryItemTextActive,
              ]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Priority */}
        <Text style={styles.sectionTitle}>Öncelik</Text>
        <View style={styles.priorityRow}>
          {PRIORITY_OPTIONS.map((opt) => (
            <Chip
              key={opt.id}
              label={opt.name}
              selected={priority === opt.id}
              onPress={() => setPriority(opt.id)}
              variant="primary"
            />
          ))}
        </View>

        {/* Form Fields */}
        <Card style={styles.formCard}>
          {(category === 'order' || category === 'trade') && (
            <Input
              label="Sipariş/Takas Numarası (Opsiyonel)"
              value={orderId}
              onChangeText={setOrderId}
              style={styles.input}
            />
          )}

          <Input
            label="Konu *"
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
          />

          <Textarea
            label="Açıklama *"
            value={description}
            onChangeText={setDescription}
            style={styles.input}
            rows={6}
          />

          <Text style={styles.note}>
            * ile işaretli alanların doldurulması zorunludur.
          </Text>
        </Card>

        {/* User Info */}
        <Card style={styles.userInfoCard}>
          <Text style={styles.userInfoTitle}>İletişim Bilgileriniz</Text>
          <View style={styles.userInfoRow}>
            <Ionicons name="person-outline" size={18} color={colors.text.muted} />
            <Text style={styles.userInfoText}>{user?.displayName}</Text>
          </View>
          <View style={styles.userInfoRow}>
            <Ionicons name="mail-outline" size={18} color={colors.text.muted} />
            <Text style={styles.userInfoText}>{user?.email}</Text>
          </View>
        </Card>

        {/* Submit Button */}
        <Button
          variant="primary"
          title="Talep Oluştur"
          onPress={handleSubmit}
          isLoading={loading}
          disabled={loading || !category || !subject || !description}
          style={styles.submitButton}
          icon="send"
        />

        {/* Contact Info */}
        <View style={styles.contactInfo}>
          <Text style={styles.contactInfoText}>
            Acil destek için: <Text style={styles.contactInfoLink}>destek@tarodan.com</Text>
          </Text>
        </View>

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
  header: {
    backgroundColor: colors.primary[600]!,
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
    color: colors.white,
  },
  authRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 16,
    marginBottom: 8,
  },
  authSubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginBottom: 24,
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
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
    gap: 8,
  },
  categoryItem: {
    width: '31%',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryItemActive: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  categoryItemText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  categoryItemTextActive: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  formCard: {
    backgroundColor: colors.surface.DEFAULT,
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  note: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  userInfoCard: {
    backgroundColor: colors.surface.alt,
    marginBottom: 24,
  },
  userInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: 12,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userInfoText: {
    marginLeft: 10,
    fontSize: 14,
    color: colors.text.heading,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 16,
  },
  contactInfo: {
    alignItems: 'center',
  },
  contactInfoText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  contactInfoLink: {
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
