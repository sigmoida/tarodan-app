import { RefreshControl, RefreshControlProps } from 'react-native';
import { theme } from '@tarodan/ui-native';

const { colors } = theme;

/**
 * Tema renklerini (primary) sabitleyen RefreshControl sarmalayıcı.
 * Tüm pull-to-refresh ekranlarında tutarlı spinner rengi sağlar.
 */
export function ThemedRefreshControl(props: RefreshControlProps) {
  return (
    <RefreshControl
      tintColor={colors.primary[600]!}
      colors={[colors.primary[600]!]}
      {...props}
    />
  );
}
