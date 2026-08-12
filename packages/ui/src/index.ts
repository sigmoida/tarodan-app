// Form controls
export { Button, buttonVariants, type ButtonProps } from "./components/Button";
export { IconButton, iconButtonVariants } from "./components/IconButton";
export type { IconButtonProps } from "./components/IconButton";
export { Input, type InputProps } from "./components/Input";
export { DatePicker, type DatePickerProps } from "./components/DatePicker";
export {
  DateTimePicker,
  type DateTimePickerProps,
} from "./components/DateTimePicker";
export {
  CardNumberInput,
  type CardNumberInputProps,
  ExpiryDateInput,
  type ExpiryDateInputProps,
  CvvInput,
  type CvvInputProps,
  IbanInput,
  type IbanInputProps,
  CARD_NUMBER_REGEX,
  EXPIRY_REGEX,
  CVV_REGEX,
  IBAN_TR_REGEX,
  isValidCardNumber,
  isExpiryValid,
  parseExpiry,
  isValidIban,
} from "./components/PaymentInputs";
export { Slider, type SliderProps } from "./components/Slider";
export {
  QuantityStepper,
  type QuantityStepperProps,
} from "./components/QuantityStepper";
export { PhoneInput, type PhoneInputProps } from "./components/PhoneInput";
export {
  countryCodes,
  DEFAULT_COUNTRY_CODE,
  formatPhoneNumber,
  getFullPhoneNumber,
  hasCountryCodePrefix,
  normalizePhoneForPayload,
  getPhoneMaxLength,
  getPhonePlaceholder,
  splitPhone,
  combinePhone,
  type CountryCode,
} from "./lib/phone";
export { SearchInput, type SearchInputProps } from "./components/SearchInput";
export { Textarea, type TextareaProps } from "./components/Textarea";
export {
  Select,
  type SelectProps,
  type SelectOption,
} from "./components/Select";
export {
  SearchableSelect,
  type SearchableSelectProps,
  type SearchableSelectOption,
} from "./components/SearchableSelect";
export {
  SearchableMultiSelect,
  type SearchableMultiSelectProps,
} from "./components/SearchableMultiSelect";
export { foldForSearch, matchesSearch } from "./lib/search";
export { Toggle, type ToggleProps } from "./components/Toggle";
export { Checkbox, type CheckboxProps } from "./components/Checkbox";
export {
  Radio,
  RadioGroup,
  type RadioProps,
  type RadioGroupProps,
  type RadioGroupOption,
} from "./components/Radio";
export { Label, type LabelProps } from "./components/Label";
export { FormField, type FormFieldProps } from "./components/FormField";
export { Logo, type LogoProps } from "./components/Logo";
export { Chip, type ChipProps } from "./components/Chip";
export {
  DisclosureButton,
  type DisclosureButtonProps,
} from "./components/DisclosureButton";
// The RHF + zod form layer is exposed via the `@tarodan/ui/form` subpath so it
// only pulls zod/react-hook-form into bundles that actually build forms.

// Display components
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
} from "./components/Card";
export { Badge, badgeVariants, type BadgeProps } from "./components/Badge";
export { StatusBadge, type StatusBadgeProps } from "./components/StatusBadge";
export {
  ProductBadge,
  type ProductBadgeProps,
  type ProductBadgeVariant,
} from "./components/ProductBadge";
export { Avatar, type AvatarProps } from "./components/Avatar";
export { Alert, type AlertProps } from "./components/Alert";
export { Modal, type ModalProps, type ModalSize } from "./components/Modal";
export { Drawer, type DrawerProps, type DrawerSide } from "./components/Drawer";
export {
  Dialog,
  ConfirmDialog,
  ModalFooter,
  type DialogProps,
  type ConfirmDialogProps,
  type ModalFooterProps,
} from "./components/Dialog";
export {
  ConfirmProvider,
  useConfirm,
  type ConfirmFn,
  type ConfirmOptions,
} from "./components/ConfirmProvider";
export { EmptyState, type EmptyStateProps } from "./components/EmptyState";
export {
  ThumbnailStack,
  type ThumbnailStackProps,
} from "./components/ThumbnailStack";
export {
  Breadcrumb,
  type BreadcrumbProps,
  type BreadcrumbItem,
} from "./components/Breadcrumb";

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
} from "./components/Table";

// Navigation / disclosure
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/Tabs";
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
} from "./components/DropdownMenu";
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./components/Accordion";
export {
  Stepper,
  useStepper,
  type StepperProps,
  type StepperStep,
} from "./components/Stepper";
export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuViewport,
  NavigationMenuIndicator,
  navigationMenuTriggerStyle,
} from "./components/NavigationMenu";
export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  type TooltipProps,
} from "./components/Tooltip";
export { Pagination, type PaginationProps } from "./components/Pagination";

// Loading states
export { Spinner, type SpinnerProps } from "./components/Spinner";
export {
  Skeleton,
  AsyncValue,
  SkeletonText,
  SkeletonCard,
  SkeletonAvatar,
  type SkeletonProps,
  type AsyncValueProps,
} from "./components/Skeleton";

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
  BUYER_SELECTABLE_REFUND_REASONS,
  orderCancellationReasonConfig,
  BUYER_SELECTABLE_CANCELLATION_REASONS,
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
} from "./lib/status-configs";

// Client policy constants (backend is the source of truth — see @tarodan/shared)
export { REFUND_COOLING_OFF_DAYS, ESCROW_RELEASE_DAYS } from "@tarodan/shared";

// Utilities
export { cn } from "./lib/utils";
export { colors } from "@tarodan/design-tokens";
