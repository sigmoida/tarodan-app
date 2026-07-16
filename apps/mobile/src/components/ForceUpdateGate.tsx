import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Button } from '@tarodan/ui-native';
import { useForceUpdate } from '@/hooks/useForceUpdate';

const { colors, spacing, radius } = theme;
// spacing tokens are numeric (spacing[2]=8, [5]=20, [6]=24) — see design-tokens.

/** Force-update copy — single source (mobile i18n sweep, #216, migrates it). */
const COPY = {
  title: 'Güncelleme gerekli',
  description:
    'Uygulamanın bu sürümü artık desteklenmiyor. Devam etmek için lütfen en son sürüme güncelleyin.',
  button: 'Şimdi güncelle',
};

/**
 * Blocking force-update gate (#233). When the API (#232) reports this build is
 * below the minimum supported version, it covers the whole app with a
 * full-screen overlay linking to the store — the user cannot reach any other
 * screen (so no further backend calls happen) until they update.
 *
 * Mounted at the root inside the providers (needs QueryClient). Fail-open:
 * renders null while loading, on any error, or on web/unknown platform.
 */
export default function ForceUpdateGate() {
  const { updateRequired, storeUrl } = useForceUpdate();
  if (!updateRequired) return null;

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <View style={styles.iconCircle}>
        <Ionicons name="cloud-download-outline" size={48} color={colors.primary[600]!} />
      </View>
      <Text variant="h2" align="center" style={styles.title}>
        {COPY.title}
      </Text>
      <Text variant="body" tone="muted" align="center" style={styles.description}>
        {COPY.description}
      </Text>
      <Button
        variant="primary"
        fullWidth
        title={COPY.button}
        onPress={() => storeUrl && Linking.openURL(storeUrl)}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: colors.surface.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.primary[50]!,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[5],
  },
  title: {
    marginBottom: spacing[2],
  },
  description: {
    marginBottom: spacing[6],
    maxWidth: 320,
  },
  button: {
    maxWidth: 320,
    width: '100%',
  },
});
