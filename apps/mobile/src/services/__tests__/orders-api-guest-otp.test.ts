import { ordersApi, guestApi } from '../api';

const mockPost = jest.fn(() => Promise.resolve({ data: { success: true, expiresInSeconds: 180 } }));

// Mock guestApi.post after module is loaded
jest.spyOn(guestApi, 'post').mockImplementation(mockPost);

describe('ordersApi.sendGuestVerificationCode', () => {
  beforeEach(() => mockPost.mockClear());

  it('doğru endpoint ve payload ile guestApi.post çağırır', async () => {
    await ordersApi.sendGuestVerificationCode({ email: 'a@b.com', expectedCheckoutCount: 2 });
    expect(mockPost).toHaveBeenCalledWith('/orders/guest/send-verification-code', {
      email: 'a@b.com',
      expectedCheckoutCount: 2,
    });
  });
});
