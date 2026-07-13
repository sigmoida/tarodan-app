import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Input, Radio, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { CityDistrictSelector, PhoneInput } from '@/components/common';
import { DEFAULT_COUNTRY_CODE } from '@/utils/phone';
import { styles } from '../_lib/styles';
import type { ShippingAddressInput, SavedAddress } from '../_lib/types';

const { colors } = theme;

export function AddressSelector({
  isBilling = false,
  isAuthenticated,
  addresses,
  selectedId,
  setSelectedId,
  inline,
  setInline,
}: {
  isBilling?: boolean;
  isAuthenticated: boolean;
  addresses: SavedAddress[];
  selectedId: string | 'new';
  setSelectedId: (id: string | 'new') => void;
  inline: ShippingAddressInput;
  setInline: React.Dispatch<React.SetStateAction<ShippingAddressInput>>;
}) {
  return (
    <View>
      {isAuthenticated && addresses.length > 0 ? (
        <View style={{ marginBottom: theme.spacing[3] }}>
          {addresses.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.savedAddressRow, selectedId === a.id && styles.savedAddressRowActive]}
              onPress={() => setSelectedId(a.id)}
            >
              <Radio checked={selectedId === a.id} onChange={() => setSelectedId(a.id)} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.addressTitle}>{a.title || a.fullName}</Text>
                  {a.isDefault ? <Text style={styles.defaultBadge}> · Varsayılan</Text> : null}
                </View>
                <Text style={styles.addressLine} numberOfLines={2}>{a.fullName} · {a.phone}</Text>
                <Text style={styles.addressLine} numberOfLines={2}>{a.address}, {a.district}/{a.city}</Text>
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.savedAddressRow, selectedId === 'new' && styles.savedAddressRowActive]}
            onPress={() => setSelectedId('new')}
          >
            <Radio checked={selectedId === 'new'} onChange={() => setSelectedId('new')} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary[600]!} />
              <Text style={[styles.addressTitle, { marginLeft: theme.spacing[2] }]}>Yeni Adres Ekle</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {selectedId === 'new' ? (
        <View>
          <Input
            label="Ad Soyad *"
            value={inline.fullName}
            onChangeText={(text: string) => setInline({ ...inline, fullName: text })}
            containerStyle={styles.input}
            testID={isBilling ? undefined : 'shipping-fullname-input'}
          />
          <PhoneInput
            label="Telefon *"
            countryCode={inline.phoneCountryCode ?? DEFAULT_COUNTRY_CODE}
            onCountryCodeChange={(code) => setInline((prev) => ({ ...prev, phoneCountryCode: code }))}
            phone={inline.phone}
            onPhoneChange={(phone) => setInline((prev) => ({ ...prev, phone }))}
            containerStyle={styles.input}
          />
          <CityDistrictSelector
            city={inline.city}
            district={inline.district}
            onChangeCity={(city) => setInline((prev) => ({ ...prev, city }))}
            onChangeDistrict={(district) => setInline((prev) => ({ ...prev, district }))}
          />
          <Input
            label="Açık Adres *"
            value={inline.address}
            onChangeText={(text: string) => setInline({ ...inline, address: text })}
            multiline
            numberOfLines={3}
            containerStyle={styles.input}
            testID={isBilling ? undefined : 'shipping-address-input'}
          />
          <Input
            label="Posta Kodu"
            value={inline.zipCode || ''}
            onChangeText={(text: string) => setInline({ ...inline, zipCode: text })}
            keyboardType="number-pad"
            maxLength={5}
            containerStyle={styles.input}
          />
        </View>
      ) : null}
    </View>
  );
}
