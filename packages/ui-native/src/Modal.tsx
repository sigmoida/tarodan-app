import React from 'react';
import {
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { theme } from './theme';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
}

const { colors, radius, spacing, typography } = theme;

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  closeOnBackdrop = true,
}) => {
  return (
    <RNModal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <Pressable
          style={styles.backdrop}
          onPress={closeOnBackdrop ? onClose : undefined}
        >
          <Pressable style={styles.sheet}>
            {title && <Text style={styles.title}>{title}</Text>}
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing[6],
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: spacing[4],
  },
});
