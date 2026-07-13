import { View, TouchableOpacity, Image } from 'react-native';
import { Button, Switch, IconButton, Text, Input, Textarea, theme } from '@tarodan/ui-native';
import { Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import { COLLECTION_TEMPLATES } from '../_lib/templates';
import type { NewCollectionController } from '../_hooks/useNewCollection';

const { colors } = theme;

/** Ana form içeriği — kapak, şablon, bilgiler, gizlilik, ipucu, gönder. */
export function NewCollectionForm({ f }: { f: NewCollectionController }) {
  const { control, errors } = f;

  return (
    <>
      {/* Cover Image */}
      <TouchableOpacity style={styles.coverImageContainer} onPress={f.pickCoverImage}>
        {f.coverImage ? (
          <Image source={{ uri: f.coverImage }} style={styles.coverImage} />
        ) : (
          <View style={styles.coverImagePlaceholder}>
            <Ionicons name="image-outline" size={48} color={colors.text.muted} />
            <Text variant="body" style={styles.coverImageText}>Kapak fotoğrafı ekle</Text>
          </View>
        )}
        {f.coverImage && (
          <IconButton
            icon="close-circle"
            accessibilityLabel="Kapak fotoğrafını kaldır"
            size="md"
            style={styles.removeCoverButton}
            onPress={() => f.setCoverImage(null)}
          />
        )}
      </TouchableOpacity>

      {/* Templates */}
      <View style={styles.card}>
        <Text variant="h3" style={styles.sectionTitle}>Şablon Seçin</Text>
        <View style={styles.templatesGrid}>
          {COLLECTION_TEMPLATES.map((template) => (
            <TouchableOpacity
              key={template.id}
              style={[
                styles.templateItem,
                f.selectedTemplate === template.id && styles.templateItemSelected,
              ]}
              onPress={() => f.selectTemplate(template)}
            >
              <Text style={styles.templateIcon}>{template.icon}</Text>
              <Text variant="bodySm" style={styles.templateName} numberOfLines={1}>
                {template.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Collection Details */}
      <View style={styles.card}>
        <Text variant="h3" style={styles.sectionTitle}>Koleksiyon Bilgileri</Text>

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <Input
              label="Koleksiyon Adı *"
              value={value}
              onChangeText={onChange}
              error={errors.name?.message}
              placeholder="örn: Ferrari 1:18 Koleksiyonum"
              containerStyle={styles.input}
            />
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, value } }) => (
            <Textarea
              label="Açıklama"
              value={value}
              onChangeText={onChange}
              rows={3}
              error={errors.description?.message}
              placeholder="Koleksiyonunuz hakkında birkaç cümle..."
              containerStyle={styles.input}
            />
          )}
        />
      </View>

      {/* Privacy Settings */}
      <View style={styles.card}>
        <Text variant="h3" style={styles.sectionTitle}>Gizlilik</Text>

        <View style={styles.privacyOption}>
          <View style={styles.privacyInfo}>
            <Ionicons name="globe-outline" size={24} color={colors.primary[600]!} />
            <View style={styles.privacyText}>
              <Text variant="body">Herkese Açık</Text>
              <Text variant="bodySm" style={styles.privacyDesc}>
                Herkes koleksiyonunuzu görebilir
              </Text>
            </View>
          </View>
          <Controller
            control={control}
            name="isPublic"
            render={({ field: { onChange, value } }) => (
              <Switch value={value} onValueChange={onChange} />
            )}
          />
        </View>

        {!f.watch('isPublic') && (
          <View style={styles.privateNote}>
            <Ionicons name="lock-closed" size={16} color={colors.text.muted} />
            <Text variant="bodySm" style={styles.privateNoteText}>
              Özel koleksiyonlar sadece siz görebilirsiniz
            </Text>
          </View>
        )}
      </View>

      {/* Tips */}
      <View style={styles.tipCard}>
        <View style={styles.tipContent}>
          <Ionicons name="bulb" size={24} color={colors.warning[600]!} />
          <View style={styles.tipText}>
            <Text variant="label">İpucu</Text>
            <Text variant="bodySm" style={styles.tipDesc}>
              Koleksiyonunuzu oluşturduktan sonra ürünlerinizi ekleyebilir, düzenleyebilir ve paylaşabilirsiniz.
            </Text>
          </View>
        </View>
      </View>

      {/* Submit Button */}
      <Button
        variant="primary"
        title="Koleksiyon Oluştur"
        onPress={f.handleSubmit(f.onSubmit)}
        isLoading={f.createMutation.isPending}
        disabled={f.createMutation.isPending}
        icon="checkmark"
        style={styles.submitButton}
      />

      <View style={{ height: 50 }} />
    </>
  );
}
