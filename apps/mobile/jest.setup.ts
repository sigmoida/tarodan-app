/**
 * Jest setup — mobil komponent/birim testleri.
 * RNTL 12.4+ built-in Jest matcher'ları (toBeDisabled, toBeOnTheScreen, ...) otomatik kayıtlı.
 * Native modül mock'ları gerektikçe buraya eklenir (SecureStore, AsyncStorage, image-picker).
 */

// Test modu: register birthDate öndolu (1990-01-01), şifre alanları maskesiz.
// Uygulama EXPO_PUBLIC_MAESTRO==='1' ile bu davranışları açar.
process.env.EXPO_PUBLIC_MAESTRO = '1';

// expo-secure-store: testte gerçek keychain yok — no-op mock.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// react-native-safe-area-context: testte SafeAreaProvider yok → sabit inset mock.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: ({ children }: any) => children,
    SafeAreaInsetsContext: React.createContext(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// @expo/vector-icons: async font yüklemesi act() uyarısı üretiyor → basit metin mock.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const makeIcon = (name: string) => (props: any) =>
    React.createElement(Text, props, props?.name ? `${name}:${props.name}` : name);
  return {
    Ionicons: makeIcon('Ionicons'),
    MaterialIcons: makeIcon('MaterialIcons'),
    MaterialCommunityIcons: makeIcon('MaterialCommunityIcons'),
    FontAwesome: makeIcon('FontAwesome'),
    Feather: makeIcon('Feather'),
  };
});

// @react-native-google-signin: native TurboModule (RNGoogleSignin) testte kayıtlı
// değil → import anında "could not be found" ile suite load'u patlıyordu. No-op mock.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ idToken: 'test-id-token' })),
    signOut: jest.fn(() => Promise.resolve()),
  },
  statusCodes: {},
  GoogleSigninButton: () => null,
}));

// appAlert: native Alert.alert yerine geçen temalı dialog (AlertDialogHost testte
// mount edilmez) → global jest.fn mock. Testler `appAlert as jest.Mock` ile erişir.
jest.mock('@tarodan/ui-native', () => ({
  ...jest.requireActual('@tarodan/ui-native'),
  appAlert: jest.fn(),
}));

// Her testte appAlert çağrı geçmişini sıfırla (testler arası sızıntı olmasın).
beforeEach(() => {
  const { appAlert } = jest.requireMock('@tarodan/ui-native');
  (appAlert as jest.Mock).mockReset();
});
