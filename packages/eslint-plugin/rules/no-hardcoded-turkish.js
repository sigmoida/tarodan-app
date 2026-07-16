/**
 * no-hardcoded-turkish (#225)
 *
 * Flags string literals, template chunks, and JSX text containing
 * Turkish-specific characters (çğıöşüÇĞİÖŞÜ). In a migrated-to-catalog
 * codebase these only appear when someone hardcodes user-facing Turkish
 * copy instead of adding a key to packages/i18n — exactly the drift the
 * i18n epic (#208) eliminates.
 *
 * The Turkish-character heuristic keeps false positives near zero: ASCII
 * identifiers, keys, URLs, class names and English copy never match. Copy
 * that legitimately lives outside the catalog (see docs/i18n.md) should
 * carry an eslint-disable comment with a reason, so exceptions stay
 * visible in review.
 */
'use strict';

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'disallow hardcoded Turkish text in string literals, templates and JSX — use the @tarodan/i18n catalog',
    },
    schema: [],
    messages: {
      hardcoded:
        'Hardcoded Turkish text — add a key to packages/i18n and render it via the catalog (t()/i18nMessage). See docs/i18n.md.',
    },
  },

  create(context) {
    function report(node) {
      context.report({ node, messageId: 'hardcoded' });
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string' && TURKISH_CHARS.test(node.value)) {
          report(node);
        }
      },
      TemplateElement(node) {
        if (node.value && TURKISH_CHARS.test(node.value.cooked ?? '')) {
          report(node);
        }
      },
      JSXText(node) {
        if (TURKISH_CHARS.test(node.value)) {
          report(node);
        }
      },
    };
  },
};
