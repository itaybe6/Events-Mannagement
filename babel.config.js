module.exports = function (api) {
  api.cache(true);
  
  const importMetaPolyfillPlugin = () => {
    return {
      name: 'import-meta-polyfill',
      visitor: {
        MetaProperty(path) {
          // Replace import.meta with a safe polyfill for web
          if (
            path.node.meta.name === 'import' &&
            path.node.property.name === 'meta'
          ) {
            path.replaceWithSourceString(
              '(typeof globalThis !== "undefined" && globalThis.importMeta) || {}'
            );
          }
        },
      },
    };
  };
  
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      // NativeWind (react-native-css-interop) is a preset, not a plugin.
      "nativewind/babel",
    ],
    plugins: [
      // Polyfill import.meta for web compatibility
      importMetaPolyfillPlugin,
      // Must be listed last.
      "react-native-reanimated/plugin",
    ],
  };
};

