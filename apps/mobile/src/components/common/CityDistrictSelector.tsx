import React, { useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Modal, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, Input, Text } from '@tarodan/ui-native';
import { turkeyLocations, getDistrictsForCity } from '../../utils/turkeyLocations';

const { colors } = theme;

/**
 * Web `CityDistrictSelector` bileşeninin mobile karşılığı.
 *
 * - 81 il + tüm ilçeler `turkeyLocations`'tan gelir.
 * - İl seçildiğinde ilçe listesi otomatik bağımlı güncellenir.
 * - "Search" yazılınca arama yapılır.
 * - Boş alan dokunulduğunda alttan modal liste açar.
 */
interface Props {
  city: string;
  district: string;
  onChangeCity: (city: string) => void;
  onChangeDistrict: (district: string) => void;
  /** İlçeyi gizle (örn. checkout'ta tek satır il gösterimi) */
  hideDistrict?: boolean;
  /** Form hata stili göster */
  cityError?: boolean;
  districtError?: boolean;
}

export function CityDistrictSelector({
  city,
  district,
  onChangeCity,
  onChangeDistrict,
  hideDistrict = false,
  cityError,
  districtError,
}: Props) {
  const [cityModal, setCityModal] = useState(false);
  const [districtModal, setDistrictModal] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [districtSearch, setDistrictSearch] = useState('');

  const filteredCities = useMemo(() => {
    const q = citySearch.toLocaleLowerCase('tr-TR').trim();
    if (!q) return turkeyLocations;
    return turkeyLocations.filter(c => c.name.toLocaleLowerCase('tr-TR').includes(q));
  }, [citySearch]);

  const districts = useMemo(() => getDistrictsForCity(city), [city]);
  const filteredDistricts = useMemo(() => {
    const q = districtSearch.toLocaleLowerCase('tr-TR').trim();
    if (!q) return districts;
    return districts.filter(d => d.toLocaleLowerCase('tr-TR').includes(q));
  }, [districts, districtSearch]);

  const selectCity = (next: string) => {
    if (next !== city) {
      onChangeCity(next);
      // İl değişince ilçe sıfırlanır (web ile aynı davranış)
      onChangeDistrict('');
    }
    setCityModal(false);
    setCitySearch('');
  };

  const selectDistrict = (next: string) => {
    onChangeDistrict(next);
    setDistrictModal(false);
    setDistrictSearch('');
  };

  // Modal'ı açmadan önce klavyeyi kapat: aksi halde iOS'ta pageSheet,
  // açık klavyenin arkasında kalıp "açılmıyor / seçilemiyor" gibi görünür.
  const openCityModal = () => {
    Keyboard.dismiss();
    setCityModal(true);
  };

  const openDistrictModal = () => {
    if (!city) return;
    Keyboard.dismiss();
    setDistrictModal(true);
  };

  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={openCityModal}
        style={[
          styles.fakeInput,
          cityError && styles.fakeInputError,
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.fakeLabel}>İl *</Text>
          <Text
            style={[
              styles.fakeValue,
              !city && styles.fakePlaceholder,
            ]}
            numberOfLines={1}
          >
            {city || 'Bir il seçin'}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.text.muted} />
      </TouchableOpacity>

      {!hideDistrict ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={openDistrictModal}
          disabled={!city}
          style={[
            styles.fakeInput,
            districtError && styles.fakeInputError,
            !city && styles.fakeInputDisabled,
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.fakeLabel}>İlçe *</Text>
            <Text
              style={[
                styles.fakeValue,
                !district && styles.fakePlaceholder,
              ]}
              numberOfLines={1}
            >
              {district || (city ? 'Bir ilçe seçin' : 'Önce il seçin')}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.text.muted} />
        </TouchableOpacity>
      ) : null}

      {/* City modal — uygulama genelinde kanıtlanmış pageSheet deseni
          (bkz. ProductFilterSheet). transparent + absolute bottom-sheet
          deseni iOS'ta klavye/dokunma sorunlarına yol açıyordu. */}
      <Modal
        visible={cityModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCityModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>İl Seç</Text>
            <TouchableOpacity onPress={() => setCityModal(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.text.muted} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetSearch}>
            <Input
              placeholder="İl ara…"
              value={citySearch}
              onChangeText={setCitySearch}
              leftIconName="search"
            />
          </View>
          <FlatList
            data={filteredCities}
            keyExtractor={(item) => item.name}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, city === item.name && styles.rowSelected]}
                onPress={() => selectCity(item.name)}
              >
                <Text style={styles.rowText}>{item.name}</Text>
                {city === item.name ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary[600]!} />
                ) : null}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* District modal */}
      <Modal
        visible={districtModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDistrictModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>İlçe Seç ({city})</Text>
            <TouchableOpacity onPress={() => setDistrictModal(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.text.muted} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetSearch}>
            <Input
              placeholder="İlçe ara…"
              value={districtSearch}
              onChangeText={setDistrictSearch}
              leftIconName="search"
            />
          </View>
          <FlatList
            data={filteredDistricts}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, district === item && styles.rowSelected]}
                onPress={() => selectDistrict(item)}
              >
                <Text style={styles.rowText}>{item}</Text>
                {district === item ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary[600]!} />
                ) : null}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  fakeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 56,
    marginBottom: 12,
  },
  fakeInputError: {
    borderColor: colors.danger[600]!,
  },
  fakeInputDisabled: {
    backgroundColor: colors.surface.alt,
    opacity: 0.6,
  },
  fakeLabel: {
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: 2,
  },
  fakeValue: {
    fontSize: 15,
    color: colors.text.heading,
  },
  fakePlaceholder: {
    color: colors.text.subtle,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.DEFAULT,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.heading,
  },
  sheetSearch: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  rowSelected: {
    backgroundColor: colors.primary[50]!,
  },
  rowText: {
    fontSize: 14,
    color: colors.text.heading,
  },
});

export default CityDistrictSelector;
