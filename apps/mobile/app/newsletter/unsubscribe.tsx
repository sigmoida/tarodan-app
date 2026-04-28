import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, Snackbar } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme';
import { api } from '../../src/services/api';

export default function NewsletterUnsubscribeScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const handleTokenUnsubscribe = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`);
      setUnsubscribed(true);
      setSnackbar({ visible: true, message: data.message || 'Abonelik iptal edildi' });
    } catch (err: any) {
      setSnackbar({ visible: true, message: err.response?.data?.message || 'Geçersiz veya süresi dolmuş link' });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailUnsubscribe = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setSnackbar({ visible: true, message: 'Lütfen e-posta adresinizi girin' });
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/newsletter/unsubscribe', { email: trimmed });
      setUnsubscribed(true);
      setSnackbar({ visible: true, message: data.message || 'Abonelik iptal edildi' });
    } catch (err: any) {
      setSnackbar({ visible: true, message: err.response?.data?.message || 'İstek başarısız' });
    } finally {
      setLoading(false);
    }
  };

  if (token && !unsubscribed) {
    handleTokenUnsubscribe();
  }

  if (unsubscribed) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bülten Aboneliği</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#22C55E" />
          <Text style={styles.successTitle}>Abonelik İptal Edildi</Text>
          <Text style={styles.successDesc}>
            Bülten aboneliğiniz başarıyla iptal edildi. Artık bülten e-postaları almayacaksınız.
          </Text>
          <Button mode="contained" onPress={() => router.replace('/')} style={{ marginTop: 24, backgroundColor: TarodanColors.primary }}>
            Ana Sayfaya Dön
          </Button>
          <TouchableOpacity onPress={() => router.push('/newsletter')} style={{ marginTop: 16 }}>
            <Text style={{ color: TarodanColors.primary, fontWeight: '500' }}>Tekrar abone ol</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bülten Abonelik İptali</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconRow}>
          <Ionicons name="mail-unread-outline" size={48} color={TarodanColors.primary} />
        </View>
        <Text style={styles.pageTitle}>Bülten Abonelik İptali</Text>
        <Text style={styles.pageSubtitle}>E-posta adresinizi girerek bülten aboneliğinizi iptal edebilirsiniz.</Text>

        <TextInput
          label="E-posta Adresiniz"
          value={email}
          onChangeText={setEmail}
          mode="outlined"
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          outlineColor={TarodanColors.border}
          activeOutlineColor={TarodanColors.primary}
        />

        <Button
          mode="contained"
          onPress={handleEmailUnsubscribe}
          loading={loading}
          disabled={loading}
          style={styles.submitButton}
          buttonColor={TarodanColors.primary}
          icon="email-off-outline"
        >
          Aboneliği İptal Et
        </Button>

        <TouchableOpacity onPress={() => router.push('/newsletter')} style={{ marginTop: 24, alignItems: 'center' }}>
          <Text style={{ color: TarodanColors.primary, fontWeight: '500' }}>Tekrar abone ol</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Snackbar visible={snackbar.visible} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} duration={3000}>
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TarodanColors.backgroundSecondary },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: TarodanColors.textOnPrimary },
  content: { flex: 1, padding: 16 },
  iconRow: { alignItems: 'center', marginTop: 24, marginBottom: 16 },
  pageTitle: { fontSize: 22, fontWeight: 'bold', color: TarodanColors.text, textAlign: 'center' },
  pageSubtitle: { fontSize: 14, color: TarodanColors.textLight, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  input: { marginBottom: 16, backgroundColor: TarodanColors.background },
  submitButton: { borderRadius: 12 },
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  successTitle: { fontSize: 22, fontWeight: 'bold', color: TarodanColors.text, marginTop: 16 },
  successDesc: { fontSize: 14, color: TarodanColors.textLight, textAlign: 'center', marginTop: 8, lineHeight: 22 },
});
