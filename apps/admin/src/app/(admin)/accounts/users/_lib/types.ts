export interface User {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  isSeller: boolean;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  lastLoginAt?: string;
  membershipTier?: string;
  ordersCount: number;
  productsCount: number;
}

/** Normalize the varied user payload into the User shape. */
export function mapUsers(raw: any[]): User[] {
  return raw.map((u: any) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName ?? u.email?.split('@')[0] ?? '-',
    phone: u.phone,
    isSeller: u.isSeller,
    isVerified: u.isVerified,
    isBanned: Boolean(u.isBanned),
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    membershipTier: u.membership?.tier?.type ?? 'free',
    ordersCount: u._count?.buyerOrders ?? u._count?.sellerOrders ?? 0,
    productsCount: u._count?.products ?? 0,
  }));
}

/** list ↔ AI Denetim tabs. */
export const USER_TABS = [
  { key: 'list', label: 'Kullanıcılar' },
  { key: 'ai', label: 'AI Denetim' },
];

export const userFilterOptions = [
  { value: 'all', label: 'Tüm Kullanıcılar' },
  { value: 'sellers', label: 'Satıcılar' },
  { value: 'buyers', label: 'Alıcılar' },
  { value: 'banned', label: 'Engelliler' },
];

/** Map the "filter" chip to getUsers query flags. */
export function userFilterParams(filter?: string) {
  return {
    isSeller: filter === 'sellers' ? true : filter === 'buyers' ? false : undefined,
    isBanned: filter === 'banned' ? true : undefined,
  };
}
