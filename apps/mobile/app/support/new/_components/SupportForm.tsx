import { View, TouchableOpacity } from 'react-native';
import { Text, Card, Chip, Input, Textarea, Button, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORT_EMAIL } from '@/constants/legalFacts';
import { styles } from '../_lib/styles';
import { SUPPORT_CATEGORIES, PRIORITY_OPTIONS } from '../_lib/constants';
import type { SupportFormController } from '../_hooks/useSupportForm';

const { colors } = theme;

/** Kategori grid + öncelik + form alanları + iletişim bilgisi + gönder. */
export function SupportForm({ f }: { f: SupportFormController }) {
  return (
    <>
      {/* Category Selection */}
      <Text style={styles.sectionTitle}>Kategori Seçin</Text>
      <View style={styles.categoriesGrid}>
        {SUPPORT_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.categoryItem, f.category === cat.id && styles.categoryItemActive]}
            onPress={() => f.setCategory(cat.id)}
          >
            <Ionicons
              name={cat.icon as any}
              size={24}
              color={f.category === cat.id ? colors.primary[600]! : colors.text.muted}
            />
            <Text style={[styles.categoryItemText, f.category === cat.id && styles.categoryItemTextActive]}>
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
            selected={f.priority === opt.id}
            onPress={() => f.setPriority(opt.id)}
            variant="primary"
          />
        ))}
      </View>

      {/* Form Fields */}
      <Card style={styles.formCard}>
        {(f.category === 'shipping' || f.category === 'trade') && (
          <Input
            label="Sipariş/Takas Numarası (Opsiyonel)"
            value={f.orderId}
            onChangeText={f.setOrderId}
            style={styles.input}
          />
        )}

        <Input label="Konu *" value={f.subject} onChangeText={f.setSubject} style={styles.input} />

        <Textarea
          label="Açıklama *"
          value={f.description}
          onChangeText={f.setDescription}
          style={styles.input}
          rows={6}
        />

        <Text style={styles.note}>* ile işaretli alanların doldurulması zorunludur.</Text>
      </Card>

      {/* User Info */}
      <Card style={styles.userInfoCard}>
        <Text style={styles.userInfoTitle}>İletişim Bilgileriniz</Text>
        <View style={styles.userInfoRow}>
          <Ionicons name="person-outline" size={18} color={colors.text.muted} />
          <Text style={styles.userInfoText}>{f.user?.displayName}</Text>
        </View>
        <View style={styles.userInfoRow}>
          <Ionicons name="mail-outline" size={18} color={colors.text.muted} />
          <Text style={styles.userInfoText}>{f.user?.email}</Text>
        </View>
      </Card>

      {/* Submit Button */}
      <Button
        variant="primary"
        title="Talep Oluştur"
        onPress={f.handleSubmit}
        isLoading={f.loading}
        disabled={f.loading || !f.category || !f.subject || !f.description}
        style={styles.submitButton}
        icon="send"
        fullWidth
      />

      {/* Contact Info */}
      <View style={styles.contactInfo}>
        <Text style={styles.contactInfoText}>
          Acil destek için: <Text style={styles.contactInfoLink}>{SUPPORT_EMAIL}</Text>
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </>
  );
}
