// Form controls
export { Button, buttonVariants, type ButtonProps } from './Button';
export { IconButton, iconButtonVariants } from './IconButton';
export type { IconButtonProps } from './IconButton';
export { Input, type InputProps } from './Input';
export { SearchInput, type SearchInputProps } from './SearchInput';
export { Textarea, type TextareaProps } from './Textarea';
export { Select, type SelectProps, type SelectOption } from './Select';
export { Toggle, type ToggleProps } from './Toggle';
export { Checkbox, type CheckboxProps } from './Checkbox';
export {
  Radio,
  RadioGroup,
  type RadioProps,
  type RadioGroupProps,
  type RadioGroupOption,
} from './Radio';
export { Label, type LabelProps } from './Label';
export { FormField, type FormFieldProps } from './FormField';

// Display components
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
} from './Card';
export { Badge, badgeVariants, type BadgeProps } from './Badge';
export { StatusBadge, type StatusBadgeProps } from './StatusBadge';
export { ProductBadge, type ProductBadgeProps, type ProductBadgeVariant } from './ProductBadge';
export { Avatar, type AvatarProps } from './Avatar';
export { Alert, type AlertProps } from './Alert';
export { Modal, type ModalProps } from './Modal';
export { Dialog, ConfirmDialog, type DialogProps, type ConfirmDialogProps } from './Dialog';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Breadcrumb, type BreadcrumbProps, type BreadcrumbItem } from './Breadcrumb';

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
} from './Table';

// Navigation / disclosure
export { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';
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
} from './DropdownMenu';
export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  type TooltipProps,
} from './Tooltip';
export { Pagination, type PaginationProps } from './Pagination';

// Loading states
export { Spinner, type SpinnerProps } from './Spinner';
export { Skeleton, SkeletonText, SkeletonCard, SkeletonAvatar, type SkeletonProps } from './Skeleton';

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
} from './status-configs';

// Utilities
export { cn } from './utils';
export { colors } from '@tarodan/design-tokens';
