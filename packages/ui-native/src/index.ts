/** @format */

export { theme, type Theme } from './lib/theme';

export {
	Button,
	type ButtonProps,
	type ButtonVariant,
	type ButtonSize,
} from './components/Button';
export {
	IconButton,
	type IconButtonProps,
	type IconButtonVariant,
	type IconButtonSize,
} from './components/IconButton';
export {
	Text,
	type TextProps,
	type TextVariant,
	type TextTone,
} from './components/Text';
export { Stack, VStack, HStack, type StackProps } from './components/Stack';
export {
	Screen,
	type ScreenProps,
	type ScreenBackground,
} from './components/Screen';
export {
	ScreenHeader,
	type ScreenHeaderProps,
	type ScreenHeaderVariant,
} from './components/ScreenHeader';
export { EmptyState, type EmptyStateProps } from './components/EmptyState';
export { ErrorState, type ErrorStateProps } from './components/ErrorState';
export {
	ScreenLoader,
	type ScreenLoaderProps,
} from './components/ScreenLoader';
export {
	Chip,
	type ChipProps,
	type ChipVariant,
	type ChipSize,
} from './components/Chip';
export { Divider, type DividerProps } from './components/Divider';
export { Switch, type SwitchProps } from './components/Switch';
export {
	SegmentedButtons,
	type SegmentedButtonsProps,
	type SegmentedOption,
} from './components/SegmentedButtons';
export { ProgressBar, type ProgressBarProps } from './components/ProgressBar';
export {
	FAB,
	type FABProps,
	type FABVariant,
	type FABSize,
} from './components/FAB';
export {
	Snackbar,
	type SnackbarProps,
	type SnackbarVariant,
} from './components/Snackbar';
export { Input, type InputProps } from './components/Input';
// The RHF + zod form layer is exposed via the `@tarodan/ui-native/form` subpath
// so it only pulls zod/react-hook-form into bundles that actually build forms.
export { DateField, type DateFieldProps } from './components/DateField';
export { Textarea, type TextareaProps } from './components/Textarea';
export {
	Select,
	type SelectProps,
	type SelectOption,
} from './components/Select';
export { Checkbox, type CheckboxProps } from './components/Checkbox';
export {
	Radio,
	RadioGroup,
	type RadioProps,
	type RadioGroupProps,
	type RadioGroupOption,
} from './components/Radio';
export { Card, type CardProps } from './components/Card';
export { Badge, type BadgeProps, type BadgeVariant } from './components/Badge';
export { Alert, type AlertProps, type AlertVariant } from './components/Alert';
export { Modal, type ModalProps } from './components/Modal';
export {
	appAlert,
	AlertDialogHost,
	type AlertDialogButton,
	type AlertDialogOptions,
} from './components/AlertDialog';
export { Spinner, type SpinnerProps } from './components/Spinner';
export { Avatar, type AvatarProps } from './components/Avatar';
export { StatusBadge, type StatusBadgeProps } from './components/StatusBadge';

// Re-export status configs from shared package for convenience
export {
	orderStatusConfig,
	tradeStatusConfig,
	offerStatusConfig,
	paymentStatusConfig,
	productStatusConfig,
	type StatusConfig,
} from './lib/status-configs';
