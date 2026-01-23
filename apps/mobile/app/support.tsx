import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, Card, RadioButton, Snackbar, Chip } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/stores/authStore';
import { TarodanColors } from '../src/theme';

const SUPPORT_CATEGORIES = [
  { id: 'order', name: 'Sipariş Sorunu', icon: 'cube-outline' },
  { id: 'payment', name: 'Ödeme Sorunu', icon: 'card-outline' },
  { id: 'account', name: 'Hesap Sorunu', icon: 'person-outline' },
  { id: 'listing', name: 'İlan Sorunu', icon: 'pricetag-outline' },
  { id: 'trade', name: 'Takas Sorunu', icon: 'swap-horizontal' },
  { id: 'other', name: 'Diğer', icon: 'ellipsis-horizontal' },
];

const PRIORITY_OPTIONS = [
  { id: 'low', name: 'Düşük', color: TarodanColors.success },
  { id: 'medium', name: 'Orta', color: TarodanColors.warning },
  { id: 'high', name: 'Yüksek', color: TarodanColors.error },
];

export default function SupportScreen() {
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
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Destek</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.authRequired}>
          <Ionicons name="headset-outline" size={64} color={TarodanColors.primary} />
          <Text style={styles.authTitle}>Giriş Gerekli</Text>
          <Text style={styles.authSubtitle}>
            Destek talebi oluşturmak için giriş yapmanız gerekmektedir.
          </Text>
          <Button
            mode="contained"
            onPress={() => router.push('/(auth)/login')}
            buttonColor={TarodanColors.primary}
          >
            Giriş Yap
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
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
                color={category === cat.id ? TarodanColors.primary : TarodanColors.textSecondary} 
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
              selected={priority === opt.id}
              onPress={() => setPriority(opt.id)}
              style={[
                styles.priorityChip,
                priority === opt.id && { backgroundColor: opt.color + '20' },
              ]}
              textStyle={{ color: priority === opt.id ? opt.color : TarodanColors.textSecondary }}
            >
              {opt.name}
            </Chip>
          ))}
        </View>

        {/* Form Fields */}
        <Card style={styles.formCard}>
          <Card.Content>
            {(category === 'order' || category === 'trade') && (
              <TextInput
                label="Sipariş/Takas Numarası (Opsiyonel)"
                value={orderId}
                onChangeText={setOrderId}
                mode="outlined"
                style={styles.input}
                outlineColor={TarodanColors.border}
                activeOutlineColor={TarodanColors.primary}
              />
            )}
            
            <TextInput
              label="Konu *"
              value={subject}
              onChangeText={setSubject}
              mode="outlined"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            
            <TextInput
              label="Açıklama *"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              style={styles.input}
              multiline
              numberOfLines={6}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />

            <Text style={styles.note}>
              * ile işaretli alanların doldurulması zorunludur.
            </Text>
          </Card.Content>
        </Card>

        {/* User Info */}
        <Card style={styles.userInfoCard}>
          <Card.Content>
            <Text style={styles.userInfoTitle}>İletişim Bilgileriniz</Text>
            <View style={styles.userInfoRow}>
              <Ionicons name="person-outline" size={18} color={TarodanColors.textSecondary} />
              <Text style={styles.userInfoText}>{user?.displayName}</Text>
            </View>
            <View style={styles.userInfoRow}>
              <Ionicons name="mail-outline" size={18} color={TarodanColors.textSecondary} />
              <Text style={styles.userInfoText}>{user?.email}</Text>
            </View>
          </Card.Content>
        </Card>

        {/* Submit Button */}
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading || !category || !subject || !description}
          style={styles.submitButton}
          buttonColor={TarodanColors.primary}
          icon="send"
        >
          Talep Oluştur
        </Button>

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
  authRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  authSubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textPrimary,
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
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryItemActive: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primaryLight,
  },
  categoryItemText: {
    marginTop: 8,
    fontSize: 12,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
  },
  categoryItemTextActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  priorityChip: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  formCard: {
    backgroundColor: TarodanColors.background,
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  note: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    fontStyle: 'italic',
  },
  userInfoCard: {
    backgroundColor: TarodanColors.surfaceVariant,
    marginBottom: 24,
  },
  userInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textPrimary,
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
    color: TarodanColors.textSecondary,
  },
  contactInfoLink: {
    color: TarodanColors.primary,
    fontWeight: '500',
  },
});
