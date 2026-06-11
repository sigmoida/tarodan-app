import React, { useEffect, useState } from 'react';
import {
  Modal as RNModal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from './theme';

export interface AlertDialogButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertDialogOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

interface AlertDialogRequest {
  title: string;
  message?: string;
  buttons: AlertDialogButton[];
  options?: AlertDialogOptions;
}

type Listener = (request: AlertDialogRequest) => void;

let listener: Listener | null = null;
const queue: AlertDialogRequest[] = [];

/**
 * Drop-in replacement for React Native's Alert.alert with themed UI.
 * Requires <AlertDialogHost /> to be mounted once at the app root.
 */
export function appAlert(
  title: string,
  message?: string,
  buttons?: AlertDialogButton[],
  options?: AlertDialogOptions,
): void {
  const request: AlertDialogRequest = {
    title,
    message,
    buttons: buttons?.length ? buttons : [{ text: 'Tamam' }],
    options,
  };
  if (listener) {
    listener(request);
  } else {
    queue.push(request);
  }
}

const { colors, radius, spacing, typography } = theme;

export const AlertDialogHost: React.FC = () => {
  const [current, setCurrent] = useState<AlertDialogRequest | null>(null);
  // Kuyruk sadece fonksiyonel updater'larla okunur/yazılır.
  const [, setPending] = useState<AlertDialogRequest[]>([]);

  useEffect(() => {
    listener = (request) => {
      setCurrent((prev) => {
        if (prev) {
          setPending((q) => [...q, request]);
          return prev;
        }
        return request;
      });
    };
    // Flush alerts fired before the host mounted
    while (queue.length) {
      listener(queue.shift()!);
    }
    return () => {
      listener = null;
    };
  }, []);

  const close = (button?: AlertDialogButton) => {
    setCurrent(null);
    setPending((q) => {
      if (q.length) {
        const [next, ...rest] = q;
        // Defer so the previous modal finishes dismissing first
        setTimeout(() => setCurrent(next), 50);
        return rest;
      }
      return q;
    });
    if (button) {
      button.onPress?.();
    } else {
      current?.options?.onDismiss?.();
    }
  };

  if (!current) return null;

  const { title, message, buttons, options } = current;
  const cancelable = options?.cancelable ?? false;
  const vertical = buttons.length > 2;

  return (
    <RNModal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (cancelable) close();
      }}
    >
      <Pressable
        style={styles.backdrop}
        onPress={cancelable ? () => close() : undefined}
      >
        <Pressable style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={[styles.buttonRow, vertical && styles.buttonColumn]}>
            {buttons.map((button, index) => {
              const isCancel = button.style === 'cancel';
              const isDestructive = button.style === 'destructive';
              return (
                <Pressable
                  key={`${button.text ?? 'btn'}-${index}`}
                  onPress={() => close(button)}
                  style={({ pressed }) => [
                    styles.button,
                    vertical && styles.buttonFull,
                    isCancel ? styles.buttonCancel : styles.buttonSolid,
                    isDestructive && styles.buttonDestructive,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel ? styles.buttonTextCancel : styles.buttonTextSolid,
                    ]}
                  >
                    {button.text ?? 'Tamam'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay.black50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing[6],
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.text.heading,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    color: colors.text.body,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[5],
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  buttonFull: {
    flex: 0,
    alignSelf: 'stretch',
  },
  buttonSolid: {
    backgroundColor: colors.primary[600]!,
  },
  buttonDestructive: {
    backgroundColor: colors.danger[600]!,
  },
  buttonCancel: {
    backgroundColor: colors.gray[100],
  },
  buttonText: {
    fontSize: typography.fontSize.base,
    fontWeight: '600',
  },
  buttonTextSolid: {
    color: colors.white,
  },
  buttonTextCancel: {
    color: colors.gray[900],
  },
});
