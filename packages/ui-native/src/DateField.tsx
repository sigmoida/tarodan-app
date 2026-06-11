import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Modal } from './Modal';
import { theme } from './theme';

export interface DateFieldProps {
  label?: string;
  /** ISO date string "YYYY-MM-DD" (or empty/undefined when unset). */
  value?: string;
  /** Always called with a "YYYY-MM-DD" string. */
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
  /** Shown when no value is selected. */
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  testID?: string;
  containerStyle?: ViewStyle;
}

const { colors, radius, spacing, typography } = theme;

const MONTHS_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/**
 * "YYYY-MM-DD" -> local Date. Built from numeric parts on purpose:
 * `new Date("YYYY-MM-DD")` parses as UTC midnight and can render as the
 * previous day in negative-offset timezones.
 */
function parseLocalDate(value?: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** local Date -> "YYYY-MM-DD". Avoids `toISOString()` UTC shifting a day. */
function formatLocalISO(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** "31 Ocak 1990" — readable Turkish display. */
function formatHuman(date: Date): string {
  return `${date.getDate()} ${MONTHS_TR[date.getMonth()]} ${date.getFullYear()}`;
}

export const DateField: React.FC<DateFieldProps> = ({
  label,
  value,
  onChange,
  error,
  helperText,
  placeholder = 'Tarih seçin',
  minimumDate,
  maximumDate,
  testID,
  containerStyle,
}) => {
  const selectedDate = parseLocalDate(value);
  const fallbackDate = selectedDate ?? maximumDate ?? new Date();

  const [show, setShow] = useState(false);
  // iOS keeps a draft date while the spinner moves, committed on "Tamam".
  const [draft, setDraft] = useState<Date>(fallbackDate);

  const open = () => {
    setDraft(selectedDate ?? maximumDate ?? new Date());
    setShow(true);
  };

  const onAndroidChange = (event: DateTimePickerEvent, date?: Date) => {
    setShow(false);
    if (event.type === 'set' && date) onChange(formatLocalISO(date));
  };

  const onIOSChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) setDraft(date);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        testID={testID}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.field,
          { borderColor: error ? colors.danger[600]! : colors.border.DEFAULT },
        ]}
      >
        <Text
          style={[
            styles.value,
            { color: selectedDate ? colors.text.heading : colors.text.subtle },
          ]}
        >
          {selectedDate ? formatHuman(selectedDate) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.text.muted} />
      </Pressable>

      {error || helperText ? (
        <Text style={[styles.helper, error ? styles.errorText : null]}>
          {error || helperText}
        </Text>
      ) : null}

      {Platform.OS === 'android' && show ? (
        <DateTimePicker
          value={fallbackDate}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={onAndroidChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          isOpen={show}
          onClose={() => setShow(false)}
          title={label ?? 'Tarih seçin'}
        >
          <DateTimePicker
            value={draft}
            mode="date"
            display="spinner"
            locale="tr-TR"
            themeVariant="light"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={onIOSChange}
            style={styles.iosPicker}
          />
          <View style={styles.iosButtons}>
            <Pressable
              onPress={() => setShow(false)}
              style={styles.iosBtn}
              accessibilityRole="button"
            >
              <Text style={styles.iosBtnGhost}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onChange(formatLocalISO(draft));
                setShow(false);
              }}
              style={[styles.iosBtn, styles.iosBtnPrimary]}
              accessibilityRole="button"
            >
              <Text style={styles.iosBtnPrimaryText}>Tamam</Text>
            </Pressable>
          </View>
        </Modal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: spacing[2],
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: spacing[1.5],
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.white,
  },
  value: {
    flex: 1,
    fontSize: typography.fontSize.base,
  },
  helper: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.xs,
    color: colors.text.muted,
  },
  errorText: {
    color: colors.danger[600]!,
  },
  iosPicker: {
    alignSelf: 'center',
    // iOS spinner Modal içinde explicit boyut almazsa 0 yüksekliğe çöküp
    // görünmez oluyor. Sabit yükseklik/genişlik ver.
    width: '100%',
    height: 200,
  },
  iosButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
    marginTop: spacing[4],
  },
  iosBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
  },
  iosBtnPrimary: {
    backgroundColor: colors.primary[600]!,
  },
  iosBtnGhost: {
    color: colors.text.muted,
    fontWeight: '600',
  },
  iosBtnPrimaryText: {
    color: colors.white,
    fontWeight: '600',
  },
});
