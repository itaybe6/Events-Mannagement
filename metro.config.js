const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Keep Expo defaults and ensure `web` exists (don't override the list).
config.resolver.platforms = Array.from(
  new Set([...(config.resolver.platforms ?? []), 'web'])
);

module.exports = withNativeWind(config, { input: './global.css' });