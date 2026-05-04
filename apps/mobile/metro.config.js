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

module.exports = config;
