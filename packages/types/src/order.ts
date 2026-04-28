import { Address } from './user';

export enum OrderStatus {
  PENDING = 'PENDING',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAID = 'PAID',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  WALLET = 'WALLET',
}

export interface Order {
  id: string;
  orderNumber: string;
  buyerId?: string;
  sellerId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  shippingCost: number;
  commissionAmount: number;
  status: OrderStatus;
  shippingAddress: Address;
  guestEmail?: string;
  guestPhone?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderWithDetails extends Order {
  buyer?: {
    id: string;
    displayName: string;
    email: string;
  };
  seller: {
    id: string;
    displayName: string;
    email: string;
  };
  product: {
    id: string;
    name: string;
    images: string[];
  };
  payment?: Payment;
  shipment?: Shipment;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  paymentDetails?: Record<string, any>;
  paidAt?: Date;
  createdAt: Date;
}

export interface Shipment {
  id: string;
  orderId: string;
  carrier: string;
  trackingNumber?: string;
  status: ShipmentStatus;
  shippedAt?: Date;
  deliveredAt?: Date;
  estimatedDelivery?: Date;
  createdAt: Date;
}

export enum ShipmentStatus {
  PENDING = 'PENDING',
  LABEL_CREATED = 'LABEL_CREATED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  RETURNED = 'RETURNED',
}

export interface CreateOrderDto {
  productId: string;
  quantity: number;
  shippingAddressId: string;
  notes?: string;
}

export interface GuestCheckoutDto {
  productId: string;
  quantity?: number;
  email: string;
  phone: string;
  guestName?: string;
  emailVerificationCode: string;
  shippingAddress: Omit<Address, 'id' | 'userId' | 'isDefault'>;
}

export interface InitiatePaymentDto {
  orderId: string;
  method: PaymentMethod;
  returnUrl?: string;
}
