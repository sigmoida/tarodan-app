/**
 * Jest transform for the shared i18n catalog JSONs (@tarodan/i18n).
 *
 * The API compiles without `esModuleInterop`, so ts-jest emits
 * `require("./en.json").default` for `import en from "./en.json"`. Jest's
 * native JSON loader returns the bare object (no `.default`), which silently
 * yields an empty catalog in unit tests. At runtime the API consumes the
 * package's tsup-bundled dist, where the JSON is inlined — only the jest
 * moduleNameMapper (source) path is affected.
 *
 * Jest JSON.parses the transformed output of `.json` modules, so this must
 * emit JSON, not JS: we wrap the catalog under a `default` key (plus
 * `__esModule` so an interop-enabled emit unwraps to the same object).
 */
module.exports = {
  process(sourceText) {
    return {
      code: `{ "__esModule": true, "default": ${sourceText} }`,
    };
  },
};
