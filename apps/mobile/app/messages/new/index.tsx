import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';
import { useNewMessage } from './_hooks/useNewMessage';
import { styles } from './_lib/styles';
import { NewMessageBody } from './_components/NewMessageBody';

export default function NewMessageScreen() {
  const { t } = useTranslation();
  const f = useNewMessage();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={t('mobile.messagesNew')} onBack={f.handleBack} />

      <NewMessageBody f={f} />

      {/* Send Button */}
      <View style={styles.footer}>
        <Button
          variant="primary"
          fullWidth
          size="lg"
          title="Gönder"
          onPress={f.handleSend}
          disabled={!f.selectedUser || !f.messageText.trim() || !f.canSend || f.sending}
          isLoading={f.sending}
          style={styles.sendButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
