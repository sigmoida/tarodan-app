import { useCallback, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { theme } from './theme';
import { appAlert } from './AlertDialog';

const { colors, spacing, typography } = theme;

export type ModalMessageState = { type: 'info' | 'error'; text: string } | null;

/** Modal-içi bilgi/hata mesajı state'i. appAlert'i (transparent RNModal) bir
 *  Modal açıkken çağırmak iOS'ta donma yapıyordu; bunun yerine modal içinde
 *  satır mesajı gösteriyoruz. */
export function useModalMessage() {
  const [state, setState] = useState<ModalMessageState>(null);
  const info = useCallback((text: string) => setState({ type: 'info', text }), []);
  const error = useCallback((text: string) => setState({ type: 'error', text }), []);
  const clear = useCallback(() => setState(null), []);
  return { state, info, error, clear };
}

/** Modal içine konan satır mesajı. state null ise hiçbir şey render etmez. */
export function ModalMessage({ state }: { state: ModalMessageState }) {
  if (!state) return null;
  return (
    <Text
      testID="modal-message"
      style={[styles.base, state.type === 'error' ? styles.error : styles.info]}
    >
      {state.text}
    </Text>
  );
}

/** Terminal başarı bildirimi: önce modalı kapat, sonra (modal tamamen kapandıktan
 *  sonra) appAlert göster. */
export function alertAfterClose(
  close: () => void,
  title: string,
  message?: string,
  delayMs = 400,
): void {
  close();
  setTimeout(() => appAlert(title, message), delayMs);
}

const styles = StyleSheet.create({
  base: {
    marginTop: spacing[3],
    textAlign: 'center',
    fontSize: typography.fontSize.sm,
  },
  error: { color: colors.danger[600]! },
  info: { color: colors.text.muted },
});
