import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Button, Snackbar, Text, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { useTranslation } from '@/i18n';
import { useEditProfile } from './_hooks/useEditProfile';
import { styles } from './_lib/styles';
import {
  AvatarSection,
  PersonalInfoCard,
  BusinessInfoCard,
} from './_components/EditProfileSections';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const f = useEditProfile();

  if (!f.isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="h3">Giriş Yapın</Text>
        <Button
          variant="primary"
          title="Giriş Yap"
          onPress={() => router.push('/(auth)/login')}
          style={{ alignSelf: 'center' }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('mobile.settingsEditProfile')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        right={
          <TouchableOpacity onPress={f.handleSubmit(f.onSubmit)}>
            <Text style={styles.saveButton}>{t('mobile.save')}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <AvatarSection f={f} />
        <PersonalInfoCard f={f} />
        <BusinessInfoCard f={f} />

        <Button
          variant="primary"
          fullWidth
          title="Değişiklikleri Kaydet"
          icon="checkmark"
          onPress={f.handleSubmit(f.onSubmit)}
          isLoading={f.updateMutation.isPending}
          disabled={f.updateMutation.isPending}
          style={styles.submitButton}
        />

        <View style={{ height: 50 }} />
      </ScrollView>

      <Snackbar
        visible={f.snackbar.visible}
        onDismiss={() => f.setSnackbar({ ...f.snackbar, visible: false })}
        duration={3000}
        variant={f.snackbar.variant ?? 'default'}
      >
        {f.snackbar.message}
      </Snackbar>
    </View>
  );
}
