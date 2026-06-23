const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `@ide/backoff` (transitive of expo-notifications) require'lar Node
// built-in `assert` modülünü; Metro RN için bunu polyfill etmiyor.
// Lokal stub'a yönlendir.
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  assert: path.resolve(__dirname, 'assert-stub.js'),
};

// pnpm monorepo'da kökte react 18.3.1, mobile'da 19.1.0 var. Paketlerin kendi
// nested react kopyaları bundle'a iki React instance'ı sokuyor → dispatcher null
// ("Cannot read property 'useId' of null", withDevTools/useOptionalKeepAwake).
// Her react/react-dom import'unu mobile'ın tek kopyasına zorla yönlendir.
// Bare paket VE alt-path'leri (react/jsx-runtime, react/jsx-dev-runtime...)
// hep mobile'ın tek kopyasına yönlendir. Sadece çıplak 'react' yönlendirmek
// jsx-runtime'ı başka bir react kopyasına bırakıp ReactCurrentDispatcher
// undefined hatası verir.
const singletonDirs = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
};
const redirect = (moduleName) => {
  for (const [name, dir] of Object.entries(singletonDirs)) {
    if (moduleName === name) return require.resolve(dir);
    if (moduleName.startsWith(name + '/')) {
      return require.resolve(path.join(dir, moduleName.slice(name.length + 1)));
    }
  }
  return null;
};
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const filePath = redirect(moduleName);
  if (filePath) {
    return { type: 'sourceFile', filePath };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
