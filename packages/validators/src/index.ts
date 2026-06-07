// Auth schemas
export {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type LoginInput,
  type RegisterInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from './schemas/auth';

// Product schemas
export {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  type CreateProductInput,
  type UpdateProductInput,
  type ProductQueryInput,
} from './schemas/product';

// Order schemas
export {
  addressSchema,
  createOrderSchema,
  guestCheckoutSchema,
  initiatePaymentSchema,
  type AddressInput,
  type CreateOrderInput,
  type GuestCheckoutInput,
  type InitiatePaymentInput,
} from './schemas/order';

// Listing extras (manufacturer-aware attribute selection)
export {
  attributeSelectionSchema,
  hwAttributesSchema,
  listingExtrasSchema,
  HW_ATTRIBUTE_GROUP_SLUGS,
  flattenHwAttributes,
  type AttributeSelection,
  type HwAttributes,
  type HwAttributeGroupSlug,
  type ListingExtras,
} from './schemas/listing';
