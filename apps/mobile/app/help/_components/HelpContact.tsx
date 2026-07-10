import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Input, Textarea, Button, Divider, theme } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import { CONTACT_OPTIONS } from '../_lib/faq';
import type { HelpController } from '../_hooks/useHelp';

const { colors } = theme;

/** Contact options (email/whatsapp/phone), contact form, and app info footer. */
export function HelpContact({ f }: { f: HelpController }) {
  return (
    <>
      <Divider style={styles.divider} />

      {/* Contact Section */}
      <View style={styles.contactSection}>
        <Text style={styles.sectionTitle}>Bize Ulaşın</Text>

        <View style={styles.contactOptions}>
          {CONTACT_OPTIONS.map(option => (
            <TouchableOpacity key={option.id} style={styles.contactOption} onPress={option.action}>
              <View style={styles.contactIcon}>
                <Ionicons name={option.icon as any} size={24} color={colors.primary[600]!} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactTitle}>{option.title}</Text>
                <Text style={styles.contactSubtitle}>{option.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Contact Form */}
        <View style={styles.contactForm}>
          <Text style={styles.formTitle}>Mesaj Gönderin</Text>
          <Input
            label="Adınız"
            value={f.contactName}
            onChangeText={f.setContactName}
            containerStyle={styles.input}
          />
          <Input
            label="E-posta"
            value={f.contactEmail}
            onChangeText={f.setContactEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            containerStyle={styles.input}
          />
          <Textarea
            label="Mesajınız"
            value={f.contactMessage}
            onChangeText={f.setContactMessage}
            rows={4}
            containerStyle={styles.input}
          />
          <Button
            variant="primary"
            title="Gönder"
            icon="send"
            onPress={f.handleSubmitContact}
            isLoading={f.contactSubmitting}
            disabled={f.contactSubmitting}
            style={styles.submitButton}
          />
        </View>
      </View>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={styles.appInfoText}>Tarodan v1.0.0</Text>
        <View style={styles.appLinks}>
          <TouchableOpacity onPress={() => router.push('/privacy')}>
            <Text style={styles.appLink}>Gizlilik Politikası</Text>
          </TouchableOpacity>
          <Text style={styles.appLinkDivider}>•</Text>
          <TouchableOpacity onPress={() => router.push('/terms')}>
            <Text style={styles.appLink}>Kullanım Koşulları</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}
