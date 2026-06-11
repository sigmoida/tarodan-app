import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Input, Select, Text, theme } from '@tarodan/ui-native';
import {
  countryCodes,
  DEFAULT_COUNTRY_CODE,
  formatPhoneNumber,
  getPhonePlaceholder,
} from '../../utils/phone';

const { spacing, typography, colors } = theme;

export interface PhoneInputProps {
  /** Ülke kodu (ör. "+90"). */
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  /** Lokal numara (ör. "5XX XXX XX XX"). */
  phone: string;
  onPhoneChange: (phone: string) => void;
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

/**
 * Ülke kodu Select + telefon Input combo'su (web'deki PhoneInput'un native eşi).
 * Formatlama ve placeholder otomatik; varsayılan ülke kodu +90.
 */
export const PhoneInput: React.FC<PhoneInputProps> = ({
  countryCode,
  onCountryCodeChange,
  phone,
  onPhoneChange,
  label,
  error,
  containerStyle,
}) => {
  const code = countryCode || DEFAULT_COUNTRY_CODE;

  return (
    <View style={containerStyle}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <View style={styles.codeSelect}>
          <Select
            value={code}
            onChange={onCountryCodeChange}
            options={countryCodes.map((cc) => ({
              value: cc.code,
              label: `${cc.code} ${cc.country}`,
            }))}
          />
        </View>
        <Input
          value={phone}
          onChangeText={(text) => onPhoneChange(formatPhoneNumber(text, code))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          placeholder={getPhonePlaceholder(code)}
          error={error}
          containerStyle={styles.phoneInput}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: spacing[1.5],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  codeSelect: {
    width: 108,
  },
  phoneInput: {
    flex: 1,
  },
});

export default PhoneInput;
