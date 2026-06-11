/**
 * expo-router mock'u. Test dosyasında:
 *   jest.mock('expo-router', () => require('../../src/test-utils/router-mock').routerMock);
 * sonra: import { pushMock } from '...'; expect(pushMock).toHaveBeenCalledWith('/checkout');
 * beforeEach içinde resetRouterMocks() çağır.
 */
export const pushMock = jest.fn();
export const replaceMock = jest.fn();
export const backMock = jest.fn();
export const canGoBackMock = jest.fn(() => false);

export const routerMock = {
  router: {
    push: pushMock,
    replace: replaceMock,
    back: backMock,
    canGoBack: canGoBackMock,
  },
  useLocalSearchParams: () => ({}),
  useRouter: () => routerMock.router,
};

export function resetRouterMocks() {
  pushMock.mockClear();
  replaceMock.mockClear();
  backMock.mockClear();
  canGoBackMock.mockReset();
  canGoBackMock.mockReturnValue(false);
}
