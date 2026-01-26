import { TradeStatus, ShipmentStatus, PaymentStatus } from '@prisma/client';

export class TradeItemResponseDto {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  side: string;
  quantity: number;
  valueAtTrade: number;
}

export class TradeShipmentResponseDto {
  id: string;
  shipperId: string;
  shipperName: string;
  carrier: string;
  trackingNumber?: string;
  status: ShipmentStatus;
  shippedAt?: Date;
  deliveredAt?: Date;
  confirmedAt?: Date;
}

export class TradeCashPaymentResponseDto {
  id: string;
  payerId: string;
  recipientId: string;
  amount: number;
  commission: number;
  totalAmount: number;
  status: PaymentStatus;
  paidAt?: Date;
}

export class TradeDisputeResponseDto {
  id: string;
  raisedById: string;
  reason: string;
  description: string;
  resolution?: string;
  resolvedAt?: Date;
}

export class TradeResponseDto {
  id: string;
  tradeNumber: string;
  
  initiatorId: string;
  initiatorName: string;
  receiverId: string;
  receiverName: string;
  
  status: TradeStatus;
  
  initiatorItems: TradeItemResponseDto[];
  receiverItems: TradeItemResponseDto[];
  
  cashAmount?: number;
  cashPayerId?: string;
  cashCommission?: number;
  
  initiatorMessage?: string;
  receiverMessage?: string;
  
  responseDeadline: Date;
  paymentDeadline?: Date;
  shippingDeadline?: Date;
  confirmationDeadline?: Date;
  
  initiatorShipment?: TradeShipmentResponseDto;
  receiverShipment?: TradeShipmentResponseDto;
  
  cashPayment?: TradeCashPaymentResponseDto;
  dispute?: TradeDisputeResponseDto;
  
  acceptedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  
  version?: number;
  
  createdAt: Date;
  updatedAt: Date;
}

export class TradeListResponseDto {
  trades: TradeResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}
