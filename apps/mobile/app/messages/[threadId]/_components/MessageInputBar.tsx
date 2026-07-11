import React from 'react';
import { View, TouchableOpacity, TextInput as RNTextInput, Image as RNImage } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spinner, Text, theme } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import type { MessageThreadController } from '../_hooks/useMessageThread';

const { colors } = theme;

/** Pending-image preview bar + attach/text/send input row. */
export function MessageInputBar({ f }: { f: MessageThreadController }) {
  return (
    <>
      {/* Seçilen foto önizlemesi — gönder butonuyla onaylanana dek bekler */}
      {f.pendingImage && (
        <View style={styles.pendingImageBar}>
          <RNImage
            source={{ uri: f.pendingImage.uri }}
            style={styles.pendingImageThumb}
            resizeMode="cover"
          />
          <Text style={styles.pendingImageText} numberOfLines={1}>
            Fotoğraf gönderilmeye hazır
          </Text>
          <TouchableOpacity
            style={styles.pendingImageRemove}
            onPress={() => f.setPendingImage(null)}
            disabled={f.uploadingImage || f.sending}
            accessibilityLabel="Fotoğrafı kaldır"
          >
            <Ionicons name="close-circle" size={24} color={colors.text.muted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={[
            styles.attachButton,
            (!f.canSend || f.uploadingImage) && styles.attachButtonDisabled,
          ]}
          onPress={f.handleAttachImage}
          disabled={!f.canSend || f.uploadingImage}
        >
          {f.uploadingImage ? (
            <Spinner size="sm" />
          ) : (
            <Ionicons
              name="image-outline"
              size={24}
              color={f.canSend ? colors.primary[600]! : colors.text.subtle}
            />
          )}
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <RNTextInput
            style={styles.textInput}
            placeholder={f.canSend ? 'Mesajınızı yazın...' : 'Mesaj limiti doldu'}
            placeholderTextColor={colors.text.subtle}
            value={f.inputText}
            onChangeText={f.setInputText}
            multiline
            maxLength={1000}
            editable={f.canSend && !f.uploadingImage}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.sendButton,
            ((!f.inputText.trim() && !f.pendingImage) || !f.canSend || f.sending) && styles.sendButtonDisabled,
          ]}
          onPress={f.handleSend}
          disabled={(!f.inputText.trim() && !f.pendingImage) || !f.canSend || f.sending}
        >
          <Ionicons
            name="send"
            size={24}
            color={((!f.inputText.trim() && !f.pendingImage) || !f.canSend) ? colors.text.subtle : colors.white}
          />
        </TouchableOpacity>
      </View>
    </>
  );
}
