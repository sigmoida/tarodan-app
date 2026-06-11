/** Deterministik test verisi fabrikaları. overrides ile alan ezilir. */
export function makeProduct(overrides: Record<string, any> = {}) {
  return {
    id: 'prod-1',
    title: 'Test Diecast 1:18',
    price: 390,
    quantity: 5,
    reservedQuantity: 0,
    status: 'active',
    seller: { id: 'seller-1', displayName: 'Test Satıcı' },
    images: [],
    ...overrides,
  };
}

export function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    email: 'test@demo.com',
    displayName: 'Test Kullanıcı',
    membershipTier: 'free',
    isEmailVerified: true,
    ...overrides,
  };
}

export function makeOrder(overrides: Record<string, any> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'ORD-TEST-1',
    status: 'pending_payment',
    totalAmount: 390,
    shippingCost: 24,
    subtotal: 366,
    isBuyer: true,
    ...overrides,
  };
}

export function makeOffer(overrides: Record<string, any> = {}) {
  return {
    id: 'offer-1',
    productId: 'prod-1',
    amount: 200,
    status: 'pending',
    buyerMustAccept: false,
    ...overrides,
  };
}

export function makeAddress(overrides: Record<string, any> = {}) {
  return {
    id: 'addr-1',
    fullName: 'Test Alıcı',
    phone: '5551234567',
    city: 'İstanbul',
    district: 'Kadıköy',
    address: 'Test Mah. 1',
    isDefault: true,
    ...overrides,
  };
}
