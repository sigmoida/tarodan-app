import type { StatusConfig } from '@tarodan/ui';

export interface Seller {
  id: string;
  displayName: string;
  email: string;
  sellerType: string | null;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  membership?: { tier?: { type?: string; name?: string } };
  _count: {
    products: number;
    sellerOrders: number;
  };
}

export const membershipConfig: Record<string, StatusConfig> = {
  business: { label: 'Kurumsal', variant: 'primary' },
  premium: { label: 'Premium', variant: 'success' },
  basic: { label: 'Temel', variant: 'info' },
  free: { label: 'Ücretsiz', variant: 'secondary' },
};
