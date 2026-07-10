import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Button, Input, Text, theme } from '@tarodan/ui-native';

import { CityDistrictSelector, PhoneInput } from '@/components/common';
import { styles } from '../_lib/styles';
import type { AddressesController } from '../_hooks/useAddresses';

const { colors } = theme;

/** Add/edit address dialog with per-field validation. */
export function AddressFormModal({ f }: { f: AddressesController }) {
  const { t, formData, setFormData, fieldErrors, clearFieldError } = f;
  return (
    <Modal
      isOpen={f.dialogVisible}
      onClose={() => f.setDialogVisible(false)}
      title={f.editingAddress ? 'Adresi Düzenle' : 'Yeni Adres'}
    >
      <ScrollView style={styles.dialogScroll}>
        <Input
          testID="address-title-input"
          label="Adres Başlığı *"
          value={formData.title}
          onChangeText={(text) => {
            setFormData({ ...formData, title: text });
            clearFieldError('title');
          }}
          error={fieldErrors.title}
          placeholder={t('mobile.addressTitlePlaceholder')}
          containerStyle={styles.input}
        />
        <Input
          label="Ad Soyad *"
          value={formData.fullName}
          onChangeText={(text) => {
            setFormData({ ...formData, fullName: text });
            clearFieldError('fullName');
          }}
          error={fieldErrors.fullName}
          containerStyle={styles.input}
        />
        <PhoneInput
          label="Telefon *"
          countryCode={formData.phoneCountryCode}
          onCountryCodeChange={(code) => setFormData({ ...formData, phoneCountryCode: code })}
          phone={formData.phone}
          onPhoneChange={(phone) => {
            setFormData({ ...formData, phone });
            clearFieldError('phone');
          }}
          error={fieldErrors.phone}
          containerStyle={styles.input}
        />
        <Input
          label="Adres *"
          value={formData.address}
          onChangeText={(text) => {
            setFormData({ ...formData, address: text });
            clearFieldError('address');
          }}
          error={fieldErrors.address}
          multiline
          numberOfLines={2}
          containerStyle={styles.input}
        />
        <CityDistrictSelector
          city={formData.city}
          district={formData.district}
          cityError={!!fieldErrors.city}
          districtError={!!fieldErrors.district}
          // Fonksiyonel güncelleme şart: il seçilince selector aynı anda
          // onChangeCity + onChangeDistrict('') çağırır; stale obje ile
          // yazılırsa ikinci çağrı ilk yazılan şehri ezer.
          onChangeCity={(city) => {
            setFormData((prev) => ({ ...prev, city }));
            clearFieldError('city');
          }}
          onChangeDistrict={(district) => {
            setFormData((prev) => ({ ...prev, district }));
            clearFieldError('district');
          }}
        />
        <Input
          label="Posta Kodu"
          value={formData.postalCode}
          onChangeText={(text) => setFormData({ ...formData, postalCode: text })}
          keyboardType="numeric"
          containerStyle={styles.input}
        />
        <Pressable
          style={styles.defaultCheckbox}
          onPress={() => setFormData({ ...formData, isDefault: !formData.isDefault })}
        >
          <Ionicons
            name={formData.isDefault ? 'checkbox' : 'square-outline'}
            size={24}
            color={colors.primary[600]!}
          />
          <Text style={styles.checkboxLabel}>{t('mobile.setAsDefault')}</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.dialogActions}>
        <Button variant="ghost" title={t('mobile.cancel')} onPress={() => f.setDialogVisible(false)} />
        <Button
          testID="address-save-button"
          variant="primary"
          title="Kaydet"
          onPress={f.handleSubmit}
          isLoading={f.saveMutation.isPending}
        />
      </View>
    </Modal>
  );
}
