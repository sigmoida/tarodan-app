import { View } from 'react-native';
import { Switch, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';

const { colors } = theme;

/** Tek bildirim ayarı satırı — ikon + etiket/açıklama + switch. */
export function SettingItem({
  icon,
  label,
  description,
  value,
  onToggle,
}: {
  icon: string;
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.settingItem}>
      <Ionicons name={icon as any} size={20} color={colors.text.muted} />
      <View style={styles.settingContent}>
        <Text variant="body">{label}</Text>
        <Text variant="bodySm" style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onToggle} />
    </View>
  );
}
