module.exports = function (api) {
  api.cache(true);

  const importMetaPolyfillPlugin = () => ({
    name: "import-meta-polyfill",
    visitor: {
      MetaProperty(path) {
        if (
          path.node.meta.name === "import" &&
          path.node.property.name === "meta"
        ) {
          path.replaceWithSourceString(
            '(typeof globalThis !== "undefined" && globalThis.importMeta) || {}'
          );
        }
      },
    },
  });

  return {
    presets: [
      [
        "babel-preset-expo",
        {
          jsxImportSource: "nativewind",
          unstable_transformImportMeta: true,
        },
      ],
      "nativewind/babel",
    ],
    plugins: [importMetaPolyfillPlugin, "react-native-reanimated/plugin"],
  };
};
