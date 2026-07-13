import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read?: boolean;
  isRead?: boolean;
  createdAt: string;
  link?: string | null;
  data?: {
    orderId?: string;
    productId?: string;
    productImage?: string;
    offerId?: string;
    tradeId?: string;
    threadId?: string;
    collectionId?: string;
    userId?: string;
  };
}

export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export const STOCKOUT_TYPES = new Set([
  'order_cancelled_out_of_stock',
  'offer_cancelled_out_of_stock',
  'back_in_stock',
]);
