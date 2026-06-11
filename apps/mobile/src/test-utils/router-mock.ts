/**
 * expo-router mock'u. Test dosyasında:
 *   jest.mock('expo-router', () => require('../../src/test-utils/router-mock').routerMock);
 * sonra: import { pushMock } from '...'; expect(pushMock).toHaveBeenCalledWith('/checkout');
 * beforeEach içinde resetRouterMocks() çağır.
 */
import { useEffect } from 'react';

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
  // Test ortamında focus'u mount ile eşitle: callback bir kez çalışır, cleanup desteklenir.
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => cb(), []);
  },
};

export function resetRouterMocks() {
  pushMock.mockClear();
  replaceMock.mockClear();
  backMock.mockClear();
  canGoBackMock.mockReset();
  canGoBackMock.mockReturnValue(false);
}
