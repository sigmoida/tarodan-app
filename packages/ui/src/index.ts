// Form controls
export { Button, buttonVariants, type ButtonProps } from './components/Button';
export { IconButton, iconButtonVariants } from './components/IconButton';
export type { IconButtonProps } from './components/IconButton';
export { Input, type InputProps } from './components/Input';
export { SearchInput, type SearchInputProps } from './components/SearchInput';
export { Textarea, type TextareaProps } from './components/Textarea';
export { Select, type SelectProps, type SelectOption } from './components/Select';
export { Toggle, type ToggleProps } from './components/Toggle';
export { Checkbox, type CheckboxProps } from './components/Checkbox';
export {
  Radio,
  RadioGroup,
  type RadioProps,
  type RadioGroupProps,
  type RadioGroupOption,
} from './components/Radio';
export { Label, type LabelProps } from './components/Label';
export { FormField, type FormFieldProps } from './components/FormField';
export { Form, FormInput, FormError, type FormInputProps } from './components/form/Form';
export { useZodForm } from './lib/use-zod-form';

// Display components
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
} from './components/Card';
export { Badge, badgeVariants, type BadgeProps } from './components/Badge';
export { StatusBadge, type StatusBadgeProps } from './components/StatusBadge';
export { ProductBadge, type ProductBadgeProps, type ProductBadgeVariant } from './components/ProductBadge';
export { Avatar, type AvatarProps } from './components/Avatar';
export { Alert, type AlertProps } from './components/Alert';
export { Modal, type ModalProps } from './components/Modal';
export { Dialog, ConfirmDialog, type DialogProps, type ConfirmDialogProps } from './components/Dialog';
export { EmptyState, type EmptyStateProps } from './components/EmptyState';
export { Breadcrumb, type BreadcrumbProps, type BreadcrumbItem } from './components/Breadcrumb';

// Table
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  type TableProps,
} from './components/Table';

// Navigation / disclosure
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/Tabs';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
} from './components/DropdownMenu';
export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  type TooltipProps,
} from './components/Tooltip';
export { Pagination, type PaginationProps } from './components/Pagination';

// Loading states
export { Spinner, type SpinnerProps } from './components/Spinner';
export { Skeleton, SkeletonText, SkeletonCard, SkeletonAvatar, type SkeletonProps } from './components/Skeleton';

// Status configs (pre-built status → badge mappings)
export {
  orderStatusConfig,
  tradeStatusConfig,
  refundRequestStatusConfig,
  offerStatusConfig,
  paymentStatusConfig,
  productStatusConfig,
  productConditionConfig,
  adminRoleConfig,
  ticketStatusConfig,
  taxScopeConfig,
  membershipTierConfig,
  refundReasonConfig,
  shipmentStatusConfig,
  notificationChannelConfig,
  deliveryStatusConfig,
  ticketCategoryConfig,
  ticketPriorityConfig,
  sellerTypeConfig,
  paymentHoldStatusConfig,
  payoutStatusConfig,
  subscriptionStatusConfig,
  discountTypeConfig,
  discountScopeConfig,
  messageStatusConfig,
  severityConfig,
  paymentProviderConfig,
  shipmentProviderConfig,
  enumLabel,
  type StatusConfig,
  type BadgeVariant,
} from './lib/status-configs';

// Utilities
export { cn } from './lib/utils';
export { colors } from '@tarodan/design-tokens';
